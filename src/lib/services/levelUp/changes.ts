/**
 * Die Change-Builder: jeder liefert `Change[]`, getaggt mit dem erzeugenden Schritt.
 * `upsertStep` ersetzt damit bei einem erneuten Lauf nur die eigenen Einträge.
 */
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { isFightingStyleFeature } from '../fightingStyle';
import { declaredGrantChanges, type DeclaredGrantSource } from '../declaration/grants';
import { type DeclaredChoiceSource } from '../declaration/optionList';
import { characterPropertyAnswerChanges } from '../characterProperties';
import {
  skillLabelDe,
  skillProficiencyChange,
  weaponProficiencyChange,
  armorTrainingChange,
  savingThrowChange,
} from '../proficiencyGrants';
import { ABILITY_KEYS, ABILITY_LABEL, type AbilityKey, type AbilityName } from '../../schemas/abilities';
import { readAbilityName } from '../../schemas/vocabulary';
import type { FeatureGrant } from '../../schemas/grants';
import type { Change, FeatureRider, LevelUpQuestion, RiderProficiencies } from '../../schemas/levelUp';
import type { AnalysisChoice, GainedFeature } from '../analysis/types';
import type { SpellGrantSource } from '../grantedSpells';
import { answerLabels, answerValues, recordsChoice } from './answers';
import type { StepId } from './steps';
import { declaredSpellChanges, learnInfo, type DeclaredSpells, type ValidatedRiders } from './spells';

const isAbility = (v: unknown): v is AbilityKey => typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v);

function bumpHitDice(current: string, die: number, add: number, toLevel: number): string {
  if (!die) return current;
  const re = new RegExp(`(\\d+)\\s*[WwDd]\\s*${die}\\b`);
  const m = current.match(re);
  if (m) return current.replace(re, `${Number(m[1]) + add}W${die}`);
  if (!current.trim()) return `${toLevel}W${die}`;
  return `${current} + ${add}W${die}`;
}

/**
 * REIHENFOLGE-INVARIANTE: `applyLevelUp` verarbeitet Changes in Array-Reihenfolge, also muss
 * `classFeaturesText` 'replace' NACH allen übrigen stehen — `upsertStep` sortiert stabil hiernach.
 */
export const STEP_ORDER = [
  'base-delta', 'subclass-delta', 'feature-effects', 'assemble-decisions',
  'feat-links', 'feat-effects',
  'ongoing-effects', 'class-features',
] as const;
export type BuilderStep = (typeof STEP_ORDER)[number];

type AbilityMap = Record<AbilityKey, number>;
const zeroAbil = (): AbilityMap => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });

function abilityFromAnswers(delta: LevelUpDelta, answers: Record<string, string | string[]>): AbilityMap {
  const abil = zeroAbil();
  for (let i = 1; i <= delta.asiCount; i++) {
    if (answers[`asi_or_feat_${i}`] !== 'asi') continue;
    const a1 = answers[`asi_ability1_${i}`];
    const a2 = answers[`asi_ability2_${i}`];
    if (isAbility(a1) && isAbility(a2) && a2 !== a1) { abil[a1] += 1; abil[a2] += 1; }
    else if (isAbility(a1)) abil[a1] += 2;
  }
  return abil;
}

/** Feste Boni der Merkmale — nicht spielergewählt, anders als `abilityFromAnswers`. */
function abilityFromRiders(riders: FeatureRider[]): AbilityMap {
  const abil = zeroAbil();
  for (const r of riders) for (const k of ABILITY_KEYS) abil[k] += r.abilityScoreIncrease[k] ?? 0;
  return abil;
}

export function baseDeltaChanges(delta: LevelUpDelta, hitDice: string): Change[] {
  const step: BuilderStep = 'base-delta';
  const out: Change[] = [];
  if (delta.profBonusTo !== delta.profBonusFrom)
    out.push({ target: 'proficiencyBonus', value: delta.profBonusTo, step, source: 'class-progression', label: `Übungsbonus (+${delta.profBonusFrom} → +${delta.profBonusTo})` });
  delta.spellSlotDelta.forEach((n, i) => {
    if (n > 0) out.push({ target: 'spellSlot', level: i + 1, value: n, step, source: 'class-progression', label: `Zauberplätze Grad ${i + 1}` });
  });
  // Nur beim ERSTMALIGEN Erlangen — sonst stünde es bei jedem Aufstieg eines längst
  // zaubernden Charakters erneut da (Druide 2→3).
  if (delta.castingIsNew && delta.klasseName)
    out.push({ target: 'spellcastingClass', value: delta.klasseName, step, source: 'class-progression', label: `Zauberwirken: ${delta.klasseName}` });
  const hd = bumpHitDice(hitDice, delta.hitDie, delta.levelsGained, delta.toLevel);
  if (hd) out.push({ target: 'hitDice', value: hd, step, source: 'class-progression', label: 'Trefferwürfel' });
  // Nur ein HINWEIS, keine Wahl: die Waffen kommen im Charakterbogen aus der Item-Bibliothek,
  // eine KI-Frage hier böte eine erfundene Waffenliste an.
  if (delta.masteryTo > delta.masteryFrom) {
    const value = `Waffenbeherrschung: jetzt ${delta.masteryTo} Waffen — im Charakterbogen wählbar`;
    out.push({ target: 'note', value, step, source: 'class-progression', label: value });
  }
  // Wie die Waffenbeherrschung nur ein HINWEIS: über `grantsChoice` als flow-eigene Wahl
  // markiert, die eigentliche Wahl trifft der Bogen aus der Talent-Bibliothek.
  const styleFeatures = [...delta.featuresGained, ...delta.subclassFeaturesGained].filter(isFightingStyleFeature);
  if (styleFeatures.length) {
    const value = styleFeatures.length > 1
      ? `Kampfstil: ${styleFeatures.length} neue — im Charakterbogen wählbar`
      : 'Kampfstil: im Charakterbogen wählbar';
    out.push({ target: 'note', value, step, source: 'class-progression', label: value });
  }
  for (const f of delta.featuresGained)
    out.push({ target: 'featureGained', name: f.name, sourceKey: f.key ?? '', step, source: delta.sourceKey, label: `Neues Merkmal: ${f.name}` });
  return out;
}

export function subclassChanges(subclass: { key: string; name: string } | null, subFeatures: GainedFeature[]): Change[] {
  const step: BuilderStep = 'subclass-delta';
  const out: Change[] = [];
  if (subclass?.key)
    out.push({ target: 'subclass', key: subclass.key, name: subclass.name, step, source: subclass.key, label: `Subklasse: ${subclass.name}` });
  for (const f of subFeatures)
    out.push({ target: 'featureGained', name: f.name, sourceKey: f.key ?? '', step, source: subclass?.key ?? '', label: `Neues Merkmal: ${f.name}` });
  return out;
}

/** Rider-abgeleitete AUTOMATISCHE Grants — kein Spieler-Choice. */
export function riderChanges(v: ValidatedRiders, step: 'feature-effects' | 'feat-effects'): Change[] {
  const out: Change[] = [];
  for (const name of v.grantedCantrips)
    out.push({ target: 'cantrip', name, step, source: 'class-feature', label: `Zaubertrick: ${name}` });
  for (const p of v.grantedPrepared)
    out.push({ target: 'preparedSpell', level: p.level, name: p.name, prepared: true, step, source: 'class-feature', label: `Vorbereitet (Grad ${p.level}): ${p.name}` });
  const abil = abilityFromRiders(v.riders);
  for (const k of ABILITY_KEYS) if (abil[k])
    out.push({ target: 'ability', ability: k, value: abil[k], step, source: 'feature', label: `${ABILITY_LABEL[k]} ${abil[k] > 0 ? '+' : ''}${abil[k]}` });
  out.push(...riderGrantChanges(v.riders, { step, source: 'class-feature' }));
  return out;
}

/**
 * Geteilt mit der Wizard-Assembly, damit beide Flows dieselbe Senke benutzen. Die Tabelle ist
 * über `keyof RiderProficiencies` TOTAL: ein neues Feld an der Rider-Form bricht hier den Build,
 * statt wie früher still zu verschwinden. Werte bleiben ENGLISCH, deutsch ist nur das `label`.
 */
export function riderGrantChanges(
  riders: readonly FeatureRider[],
  meta: { step: string; source: string },
): Change[] {
  const out: Change[] = [];
  const values = <T>(pick: (r: FeatureRider) => readonly T[]): T[] => [...new Set(riders.flatMap(pick))];
  const routes: { [K in keyof RiderProficiencies]: () => void } = {
    skills: () => {
      for (const skill of values((r) => r.proficiencies.skills)) out.push(skillProficiencyChange(skill, meta));
    },
    weapons: () => {
      for (const value of values((r) => r.proficiencies.weapons)) out.push(weaponProficiencyChange(value, meta));
    },
    armor: () => {
      for (const value of values((r) => r.proficiencies.armor)) out.push(armorTrainingChange(value, meta));
    },
    // Der Rider ist LLM-Ausgabe und bewusst tolerant (`z.string()`); erst hier wird sie auf
    // das geschlossene Vokabular normalisiert, Unlesbares fällt weg statt den Transport aufzuweichen.
    savingThrows: () => {
      const names = values((r) => r.proficiencies.savingThrows)
        .map(readAbilityName)
        .filter((v): v is AbilityName => v !== null);
      for (const value of new Set(names)) out.push(savingThrowChange(value, meta));
    },
    // Freitext, kein Vokabular — und in 2024 sind Sprachen ohnehin keine Übung mehr.
    tools: () => {
      for (const value of values((r) => r.proficiencies.tools))
        if (value.trim()) out.push({ target: 'toolProficiency', value, ...meta, label: `Werkzeug: ${value}` });
    },
    languages: () => {
      for (const value of values((r) => r.proficiencies.languages))
        if (value.trim()) out.push({ target: 'language', value, ...meta, label: `Sprache: ${value}` });
    },
  };
  for (const run of Object.values(routes)) run();
  // Expertise steht außerhalb der Übungsform und damit außerhalb der Tabelle.
  for (const skill of values((r) => r.expertiseSkills))
    out.push({ target: 'expertise', skill, ...meta, label: `Expertise: ${skillLabelDe(skill)}` });
  return out;
}

export interface DecisionChangesParams {
  delta: LevelUpDelta;
  answers: Record<string, string | string[]>;
  conMod: number;
  pickedCantrips: { key: string; name: string }[];
  pickedLearned: { key: string; name: string; level: number }[];
}

export function decisionChanges(p: DecisionChangesParams): Change[] {
  const step: BuilderStep = 'assemble-decisions';
  const { delta, answers } = p;
  const out: Change[] = [];

  // Beim Würfeln ist `hp_roll` bereits die SUMME aller Stufen; KON zählt je Stufe.
  if (delta.hitDie > 0) {
    const avg = Math.floor(delta.hitDie / 2) + 1;
    const rolled = Number(answers['hp_roll']);
    const hpGain = answers['hp_method'] === 'roll' && rolled > 0
      ? rolled + p.conMod * delta.levelsGained
      : (avg + p.conMod) * delta.levelsGained;
    if (hpGain) out.push({ target: 'hpMax', value: hpGain, step, source: 'hit-dice+kon', label: 'Trefferpunkte (Würfel + KON)' });
  }

  const abil = abilityFromAnswers(delta, answers);
  for (const k of ABILITY_KEYS) if (abil[k])
    out.push({ target: 'ability', ability: k, value: abil[k], step, source: 'asi', label: `${ABILITY_LABEL[k]} ${abil[k] > 0 ? '+' : ''}${abil[k]}` });

  const cantripTarget = delta.cantripTarget ?? {};
  for (const s of p.pickedCantrips)
    out.push({ target: 'cantrip', name: s.name, key: s.key, ...cantripTarget, step, source: 'class-progression', label: `Zaubertrick: ${s.name}` });

  // „Erlernt" heißt hier ins Buch, wenn die Zauberwirkende ein Buch führt (Magier) — sonst
  // IST die Auswahl die Vorbereitung (`delta.spellbook` kommt aus `Quota.swap.spells`).
  const learnAsPrepared = !delta.spellbook;
  const spellTarget = delta.spellTarget ?? {};
  for (const s of p.pickedLearned) {
    if (!s.name?.trim()) continue;
    out.push({
      target: 'preparedSpell', level: s.level, name: s.name, key: s.key, ...spellTarget,
      prepared: learnAsPrepared, step, source: 'class-progression',
      label: `${learnAsPrepared ? 'Vorbereitet' : 'Zauberbuch'} (Grad ${s.level}): ${s.name}`,
    });
  }

  return out;
}

/**
 * Zauber aus einer MERKMALS-Wahl („Eingeweihter der Magie") — ohne diesen Builder bliebe die
 * Wahl eine Notiz und landete nie am Charakter. Stets vorbereitet: sie zählen nicht gegen
 * das Klassenkontingent.
 */
export function featureSpellChanges(
  questions: LevelUpQuestion[],
  answers: Record<string, string | string[]>,
  step: BuilderStep,
  spellOf: (key: string) => { name: string; level: number } | undefined,
): Change[] {
  const out: Change[] = [];
  for (const q of questions) {
    if (q.type !== 'spell-picker') continue;
    const picks = answers[q.id];
    if (!Array.isArray(picks)) continue;
    const target = q.sourceId && q.quotaId ? { sourceId: q.sourceId, quotaId: q.quotaId } : {};
    for (const key of picks) {
      const info = spellOf(key);
      if (!info) continue;
      if (info.level === 0) out.push({ target: 'cantrip', name: info.name, key, ...target, step, source: q.featureKey || 'feature', label: `Zaubertrick: ${info.name}` });
      else out.push({ target: 'preparedSpell', level: info.level, name: info.name, key, ...target, prepared: true, step, source: q.featureKey || 'feature', label: `Vorbereitet (Grad ${info.level}): ${info.name}` });
    }
  }
  return out;
}

export function featChanges(chosenFeats: { key: string; name: string; gainedAt: number }[]): Change[] {
  const step: BuilderStep = 'feat-links';
  return chosenFeats.map((f) => ({ target: 'feat' as const, sourceKey: f.key, name: f.name, gainedAt: f.gainedAt, step, source: f.key || 'feat', label: `Talent: ${f.name}` }));
}

/**
 * Der strukturierte Teil, der ins Merkmals-Ledger geht — nur dauerhafte Wahlen
 * (`isBuildDecision`), Wahlen pro Einsatz werden beantwortet, aber nicht festgeschrieben.
 * Die Stufe kommt aus dem MERKMAL, nicht aus der Zielstufe: bei einem Sprung über mehrere
 * Stufen gehört die Wahl zu der Stufe, auf der das Merkmal kam.
 */
export function featureChoiceChanges(
  qs: LevelUpQuestion[],
  answers: Record<string, string | string[]>,
  gainedAtByKey: Map<string, number>,
  fallbackLevel: number,
  step: 'assemble-decisions' | 'feat-effects',
  nameOf: (key: string) => string = (k) => k,
): Change[] {
  const out: Change[] = [];
  for (const q of qs) {
    if (!recordsChoice(q, answers)) continue;
    // `choice` ist der englische Prompt-Kanal, `choiceDe` die Anzeige — beides festhalten.
    const choice = answerValues(q, answers[q.id], nameOf);
    const choiceDe = answerLabels(q, answers[q.id], nameOf);
    out.push({
      target: 'featureChoice',
      sourceKey: q.featureKey,
      choice,
      choiceDe,
      gainedAt: gainedAtByKey.get(q.featureKey) ?? fallbackLevel,
      step,
      source: q.featureKey,
      label: `${q.prompt}: ${choiceDe}`,
    });
  }
  return out;
}

export function ongoingChanges(sources: { feature: string; sourceKey?: string; amount: number }[], levelsGained: number): Change[] {
  const step: BuilderStep = 'ongoing-effects';
  return sources
    .map((s) => ({ target: 'hpMax' as const, value: s.amount * levelsGained, step, source: s.sourceKey || s.feature, label: s.feature }))
    .filter((c) => c.value);
}

export function classFeaturesChanges(text: string): Change[] {
  if (!text?.trim()) return [];
  return [{ target: 'classFeaturesText', mode: 'replace', value: text, step: 'class-features', source: 'ai', label: 'Klassenmerkmale (überarbeitet)' }];
}
