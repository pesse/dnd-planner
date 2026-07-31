/**
 * Die Change-Builder: jeder liefert `Change[]`, getaggt mit dem erzeugenden Schritt
 * (Provenienz). Ein erneut ausgeführter Schritt ersetzt per `upsertStep` nur seine
 * eigenen Einträge, erzeugt also kein Duplikat.
 *
 * REIHENFOLGE-INVARIANTE: `applyLevelUp` verarbeitet changes in Array-Reihenfolge, also
 * muss `classFeaturesText` 'replace' NACH allen übrigen Einträgen stehen — `upsertStep`
 * sortiert dazu stabil nach `STEP_ORDER`.
 */
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { isFightingStyleFeature } from '../fightingStyle';
import { declaredGrantChanges, type DeclaredGrantSource } from '../declaration/grants';
import { type DeclaredChoiceSource } from '../declaration/optionList';
import { characterPropertyAnswerChanges } from '../characterProperties';
import { skillLabelDe, abilityLabelDe, WEAPON_LABEL_DE, ARMOR_LABEL_DE } from '../proficiencyGrants';
import { ABILITY_KEYS, ABILITY_LABEL, type AbilityKey } from '../../schemas/abilities';
import type { FeatureGrant } from '../../schemas/grants';
import type { Change, FeatureRider, LevelUpQuestion, RiderProficiencies } from '../../schemas/levelUp';
import { decodePick } from '../spellcasting';
import type { AnalysisChoice, GainedFeature } from '../analysis/types';
import type { SpellGrantSource } from '../grantedSpells';
import { answerLabels, answerValues, recordsChoice } from './answers';
import type { StepId } from './steps';
import { declaredSpellChanges, learnInfo, type DeclaredSpells, type ValidatedRiders } from './spells';

const isAbility = (v: unknown): v is AbilityKey => typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v);

/** Erhöht die Trefferwürfel-Notation für den passenden Würfeltyp; Fallback: anhängen. */
function bumpHitDice(current: string, die: number, add: number, toLevel: number): string {
  if (!die) return current;
  const re = new RegExp(`(\\d+)\\s*[WwDd]\\s*${die}\\b`);
  const m = current.match(re);
  if (m) return current.replace(re, `${Number(m[1]) + add}W${die}`);
  if (!current.trim()) return `${toLevel}W${die}`;
  return `${current} + ${add}W${die}`;
}

// Jeder Builder liefert Change[] getaggt mit seinem erzeugenden Schritt (Provenienz).
// Die Komponente schreibt die Ergebnisse per `upsertStep` ins lebende Dokument; ein
// erneut ausgeführter Schritt ersetzt so NUR seine eigenen Einträge (kein Duplikat).
//
// REIHENFOLGE-INVARIANTE: `applyLevelUp` verarbeitet changes in Array-Reihenfolge.
// classFeaturesText 'replace' (Schritt 'class-features') muss deshalb NACH allen
// übrigen Einträgen stehen — `upsertStep` sortiert dazu stabil nach STEP_ORDER.

/** Kanonische Schritt-Reihenfolge im Dokument (bestimmt die Sortierung in upsertStep). */
export const STEP_ORDER = [
  'base-delta', 'subclass-delta', 'feature-effects', 'assemble-decisions',
  'feat-links', 'feat-effects',
  'ongoing-effects', 'class-features',
] as const;
export type BuilderStep = (typeof STEP_ORDER)[number];

type AbilityMap = Record<AbilityKey, number>;
const zeroAbil = (): AbilityMap => ({ str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 });

/** Attributsverbesserungen aus den ASI-Antworten (+2 auf A, oder +1/+1 auf A+B). */
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

/** Feste Attributsboni, die Merkmale/Talente selbst gewähren (nicht spielergewählt). */
function abilityFromRiders(riders: FeatureRider[]): AbilityMap {
  const abil = zeroAbil();
  for (const r of riders) for (const k of ABILITY_KEYS) abil[k] += r.abilityScoreIncrease[k] ?? 0;
  return abil;
}

/** Basis-Delta: Übungsbonus, Zauberplätze, Zauberklasse, Trefferwürfel + Klassen-Merkmale (Info). */
export function baseDeltaChanges(delta: LevelUpDelta, hitDice: string): Change[] {
  const step: BuilderStep = 'base-delta';
  const out: Change[] = [];
  if (delta.profBonusTo !== delta.profBonusFrom)
    out.push({ target: 'proficiencyBonus', value: delta.profBonusTo, step, source: 'class-progression', label: `Übungsbonus (+${delta.profBonusFrom} → +${delta.profBonusTo})` });
  delta.spellSlotDelta.forEach((n, i) => {
    if (n > 0) out.push({ target: 'spellSlot', level: i + 1, value: n, step, source: 'class-progression', label: `Zauberplätze Grad ${i + 1}` });
  });
  // Zauberwirken NUR eintragen, wenn es in dieser Spanne erstmals erlangt wird
  // (nicht bei jedem Aufstieg eines längst zaubernden Charakters, z.B. Druide 2→3).
  if (delta.castingIsNew && delta.klasseName)
    out.push({ target: 'spellcastingClass', value: delta.klasseName, step, source: 'class-progression', label: `Zauberwirken: ${delta.klasseName}` });
  const hd = bumpHitDice(hitDice, delta.hitDie, delta.levelsGained, delta.toLevel);
  if (hd) out.push({ target: 'hitDice', value: hd, step, source: 'class-progression', label: 'Trefferwürfel' });
  // Waffenbeherrschung: nur ein HINWEIS, keine Wahl. Welche Waffen es sind, entscheidet
  // der Charakterbogen aus der Item-Bibliothek — die Wahl ist ohnehin nach jeder langen
  // Rast änderbar, und eine KI-Frage hier würde eine erfundene Waffenliste anbieten.
  if (delta.masteryTo > delta.masteryFrom) {
    const value = `Waffenbeherrschung: jetzt ${delta.masteryTo} Waffen — im Charakterbogen wählbar`;
    out.push({ target: 'note', value, step, source: 'class-progression', label: value });
  }
  // Kampfstil: wie die Waffenbeherrschung nur ein HINWEIS, keine KI-Frage — das Merkmal ist
  // über `grantsChoice` als flow-eigene Wahl markiert und fliegt daher aus der Merkmals-
  // Analyse. Die eigentliche Wahl trifft der Charakterbogen (FightingStylePicker) aus der
  // Talent-Bibliothek; ein Kampfstil ist ein Talent-Link und nach jeder Kämpferstufe tauschbar.
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

/** Subklassen-Wahl: Subklasse setzen + neu erlangte Subklassen-Merkmale (Info). */
export function subclassChanges(subclass: { key: string; name: string } | null, subFeatures: GainedFeature[]): Change[] {
  const step: BuilderStep = 'subclass-delta';
  const out: Change[] = [];
  if (subclass?.key)
    out.push({ target: 'subclass', key: subclass.key, name: subclass.name, step, source: subclass.key, label: `Subklasse: ${subclass.name}` });
  for (const f of subFeatures)
    out.push({ target: 'featureGained', name: f.name, sourceKey: f.key ?? '', step, source: subclass?.key ?? '', label: `Neues Merkmal: ${f.name}` });
  return out;
}

/**
 * Rider-abgeleitete AUTOMATISCHE Grants (kein Spieler-Choice): gewährte Zauber/Tricks,
 * feste Attributsboni, gewährte Übungen. `step` unterscheidet Basis-Merkmale
 * ('feature-effects') von Talenten ('feat-effects').
 */
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
 * Die Übungen und die Expertise eines Riders als `Change[]` — geteilt mit der
 * Wizard-Assembly, damit beide Flows dieselbe Senke benutzen (`applyChanges`).
 *
 * Die Tabelle ist über `keyof RiderProficiencies` TOTAL: ein neues Feld an der Rider-Form
 * bricht hier den Build. Vorher zählte diese Funktion drei der sechs Arten von Hand auf,
 * und `tools`/`languages`/`savingThrows` fielen im Aufstieg still weg, obwohl das Modell
 * sie liefert und der Wizard sie anwendet.
 *
 * Werte bleiben ENGLISCH (geschlossenes Vokabular); übersetzt wird beim Anwenden, deutsch
 * ist nur das Anzeige-`label`.
 */
export function riderGrantChanges(
  riders: readonly FeatureRider[],
  meta: { step: string; source: string },
): Change[] {
  const out: Change[] = [];
  const values = <T>(pick: (r: FeatureRider) => readonly T[]): T[] => [...new Set(riders.flatMap(pick))];
  const routes: { [K in keyof RiderProficiencies]: () => void } = {
    skills: () => {
      for (const skill of values((r) => r.proficiencies.skills))
        out.push({ target: 'proficiency', skill, ...meta, label: `Übung: ${skillLabelDe(skill)}` });
    },
    // Urtümlicher Orden → Wächter, Göttlicher Orden → Beschützer.
    weapons: () => {
      for (const value of values((r) => r.proficiencies.weapons))
        out.push({ target: 'weaponProficiency', value, ...meta, label: `Übung: ${WEAPON_LABEL_DE[value] ?? value}` });
    },
    armor: () => {
      for (const value of values((r) => r.proficiencies.armor))
        out.push({ target: 'armorTraining', value, ...meta, label: `Vertrautheit: ${ARMOR_LABEL_DE[value] ?? value}` });
    },
    savingThrows: () => {
      for (const value of values((r) => r.proficiencies.savingThrows))
        out.push({ target: 'savingThrow', value, ...meta, label: `Rettungswurf: ${abilityLabelDe(value)}` });
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
  // Bereits entschiedene Expertise (rider.expertiseSkills, nicht Teil der Übungsform).
  for (const skill of values((r) => r.expertiseSkills))
    out.push({ target: 'expertise', skill, ...meta, label: `Expertise: ${skillLabelDe(skill)}` });
  return out;
}

export interface DecisionChangesParams {
  delta: LevelUpDelta;
  answers: Record<string, string | string[]>;
  konMod: number;
  pickedCantrips: string[];
  pickedLearned: { level: number; name: string }[];
  learnAsPrepared: boolean;
}

/** Spieler-Entscheidungen: Trefferpunkte, ASI, gewählte Zaubertricks/Zauber, Expertise. */
export function decisionChanges(p: DecisionChangesParams): Change[] {
  const step: BuilderStep = 'assemble-decisions';
  const { delta, answers } = p;
  const out: Change[] = [];

  // Trefferpunkte. Beim Würfeln ist `hp_roll` bereits die SUMME aller Stufen; KON je Stufe.
  if (delta.hitDie > 0) {
    const avg = Math.floor(delta.hitDie / 2) + 1;
    const rolled = Number(answers['hp_roll']);
    const hpGain = answers['hp_method'] === 'roll' && rolled > 0
      ? rolled + p.konMod * delta.levelsGained
      : (avg + p.konMod) * delta.levelsGained;
    if (hpGain) out.push({ target: 'hpMax', value: hpGain, step, source: 'hit-dice+kon', label: 'Trefferpunkte (Würfel + KON)' });
  }

  const abil = abilityFromAnswers(delta, answers);
  for (const k of ABILITY_KEYS) if (abil[k])
    out.push({ target: 'ability', ability: k, value: abil[k], step, source: 'asi', label: `${ABILITY_LABEL[k]} ${abil[k] > 0 ? '+' : ''}${abil[k]}` });

  for (const name of p.pickedCantrips)
    out.push({ target: 'cantrip', name, step, source: 'class-progression', label: `Zaubertrick: ${name}` });

  for (const s of p.pickedLearned) {
    if (!s.name?.trim()) continue;
    out.push({ target: 'preparedSpell', level: s.level, name: s.name, prepared: p.learnAsPrepared, step, source: 'class-progression', label: `${p.learnAsPrepared ? 'Vorbereitet' : 'Zauberbuch'} (Grad ${s.level}): ${s.name}` });
  }

  return out;
}

/**
 * Zauber, die eine MERKMALS-Wahl den Spieler wählen ließ (Fragen vom Typ `spell-picker` aus
 * `buildFeatureChoices`, z.B. „Eingeweihter der Magie"). Ohne diesen Builder würde die Wahl nur als
 * Notiz protokolliert, aber nie am Charakter landen. Stets vorbereitet: ein Merkmal, das
 * Zauber wählen lässt, gewährt sie auch (sie zählen nicht gegen das Klassenkontingent).
 */
export function featureSpellChanges(
  questions: LevelUpQuestion[],
  answers: Record<string, string | string[]>,
  step: BuilderStep,
): Change[] {
  const out: Change[] = [];
  for (const q of questions) {
    if (q.type !== 'spell-picker') continue;
    const picks = answers[q.id];
    if (!Array.isArray(picks)) continue;
    for (const v of picks) {
      const { level, name } = decodePick(v);
      if (!name.trim()) continue;
      if (level === 0) out.push({ target: 'cantrip', name, step, source: q.featureKey || 'feature', label: `Zaubertrick: ${name}` });
      else out.push({ target: 'preparedSpell', level, name, prepared: true, step, source: q.featureKey || 'feature', label: `Vorbereitet (Grad ${level}): ${name}` });
    }
  }
  return out;
}

/** Gewählte Talente als Referenz-Links (references.feats). */
export function featChanges(chosenFeats: { key: string; name: string; gainedAt: number }[]): Change[] {
  const step: BuilderStep = 'feat-links';
  return chosenFeats.map((f) => ({ target: 'feat' as const, sourceKey: f.key, name: f.name, gainedAt: f.gainedAt, step, source: f.key || 'feat', label: `Talent: ${f.name}` }));
}

/**
 * Getroffene Aufbau-Entscheidungen als `featureChoice`-Changes — der strukturierte Teil,
 * der im Merkmals-Ledger des Charakters landet. Nur Fragen, die ein Bibliotheks-Merkmal
 * stellt (`featureKey`) UND die eine dauerhafte Wahl sind (`isBuildDecision`); Wahlen pro
 * Einsatz werden beantwortet, aber nicht festgeschrieben.
 *
 * Die Stufe kommt aus dem Merkmal selbst, nicht aus der Zielstufe: bei einem Sprung über
 * mehrere Stufen gehört die Wahl zu der Stufe, auf der das Merkmal kam.
 */
export function featureChoiceChanges(
  qs: LevelUpQuestion[],
  answers: Record<string, string | string[]>,
  gainedAtByKey: Map<string, number>,
  fallbackLevel: number,
  step: 'assemble-decisions' | 'feat-effects',
): Change[] {
  const out: Change[] = [];
  for (const q of qs) {
    if (!recordsChoice(q, answers)) continue;
    // Beides festhalten: `choice` ist der englische Prompt-Kanal, `choiceDe` die Anzeige.
    const choice = answerValues(q, answers[q.id]);
    const choiceDe = answerLabels(q, answers[q.id]);
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

/** Fortlaufende Pro-Stufe-TP (je Quelle ein eigener Eintrag; Betrag × gewonnene Stufen). */
export function ongoingChanges(sources: { feature: string; sourceKey?: string; amount: number }[], levelsGained: number): Change[] {
  const step: BuilderStep = 'ongoing-effects';
  return sources
    .map((s) => ({ target: 'hpMax' as const, value: s.amount * levelsGained, step, source: s.sourceKey || s.feature, label: s.feature }))
    .filter((c) => c.value);
}

/** Klassenmerkmale-Freitext als Volltext-Ersatz (aus dem editierbaren Feld / KI-Rewrite). */
export function classFeaturesChanges(text: string): Change[] {
  if (!text?.trim()) return [];
  return [{ target: 'classFeaturesText', mode: 'replace', value: text, step: 'class-features', source: 'ai', label: 'Klassenmerkmale (überarbeitet)' }];
}
