/**
 * Der Spieler-Fragebogen, deterministisch aus Delta, Ridern und Deklarationen
 * abgeleitet. Keine KI: was hier gefragt wird, steht in Regeln oder Bibliothek.
 */
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { isFightingStyleFeature } from '../fightingStyle';
import { skillLabelDe, abilityLabelDe } from '../proficiencyGrants';
import { withoutDeclaredChoiceFeatures, type DeclaredChoiceSource } from '../declaration/optionList';
import { ABILITY_KEYS, ABILITY_LABEL } from '../../schemas/abilities';
import type { FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';
import { optionLabel, type AnalysisChoice } from '../analysis/types';
import type { SpellGrantSource } from '../grantedSpells';
import { withoutSpellGrantFeatures } from '../grantedSpells';
import { learnInfo } from './spells';

const opt = (value: string, label: string) => ({ value, label });
const baseQuestion = (q: Partial<LevelUpQuestion> & { id: string; type: LevelUpQuestion['type']; prompt: string }): LevelUpQuestion => ({
  help: '', options: [], defaultValue: '', required: true, spellLevels: [], spellClass: '',
  resolvesEffects: false, featureKey: '', isBuildDecision: false, ...q,
});

/**
 * Leitet die zu treffenden Spieler-Entscheidungen deterministisch aus dem Delta und den
 * (bereits validierten) Merkmals-Ridern ab. `maxSpellLevel` = höchster Zaubergrad, den der
 * Charakter (nach Aufstieg) wirken kann — bestimmt die im Picker wählbaren Grade.
 */
export function buildDecisions(
  delta: LevelUpDelta,
  riders: FeatureRider[],
  opts: { maxSpellLevel: number; klasseName: string },
): LevelUpQuestion[] {
  const qs: LevelUpQuestion[] = [];

  // Trefferpunkte — bei „Würfeln" wird tatsächlich gewürfelt (Roll-Button), nicht getippt.
  if (delta.hitDie > 0) {
    qs.push(baseQuestion({
      id: 'hp_method', type: 'choice', prompt: 'Trefferpunkte bestimmen',
      help: `Durchschnitt = ${Math.floor(delta.hitDie / 2) + 1} pro Stufe (+ KON).`,
      options: [opt('average', 'Durchschnitt'), opt('roll', 'Würfeln')], defaultValue: 'average',
    }));
    qs.push(baseQuestion({
      id: 'hp_roll', type: 'hp-roll',
      prompt: delta.levelsGained > 1 ? `Trefferwürfel auswürfeln (${delta.levelsGained}×W${delta.hitDie})` : `Trefferwürfel auswürfeln (W${delta.hitDie})`,
      help: 'Nur bei „Würfeln" — klicke zum Auswürfeln.', required: false,
      dieSides: delta.hitDie, rollCount: delta.levelsGained,
    }));
  }

  // ASI vs. Talent — eine Entscheidung je ASI-Stufe in der Spanne
  for (let i = 1; i <= delta.asiCount; i++) {
    qs.push(baseQuestion({
      id: `asi_or_feat_${i}`, type: 'choice',
      prompt: delta.asiCount > 1 ? `Attributsverbesserung ${i}: Werte erhöhen oder Talent?` : 'Attributsverbesserung: Werte erhöhen oder Talent?',
      options: [opt('asi', 'Attributswerte erhöhen'), opt('feat', 'Talent wählen')], defaultValue: 'asi',
    }));
    qs.push(baseQuestion({
      id: `asi_ability1_${i}`, type: 'choice', prompt: 'Attribut A (bei „Werte erhöhen")',
      help: 'Erhält +2 (wenn B leer) bzw. +1.', required: false,
      options: ABILITY_KEYS.map((k) => opt(k, ABILITY_LABEL[k])), defaultValue: 'kon',
    }));
    qs.push(baseQuestion({
      id: `asi_ability2_${i}`, type: 'choice', prompt: 'Attribut B (optional, für +1/+1)', required: false,
      options: [opt('none', '— (nur +2 auf A)'), ...ABILITY_KEYS.map((k) => opt(k, ABILITY_LABEL[k]))], defaultValue: 'none',
    }));
  }

  // Zaubertricks
  const cantripGain = delta.cantripDelta + riders.reduce((s, r) => s + r.extraCantrips, 0);
  if (cantripGain > 0) {
    qs.push(baseQuestion({
      id: 'cantrips', type: 'spell-picker', prompt: `${cantripGain} neue(n) Zaubertrick(s) wählen`,
      max: cantripGain, spellLevels: [0], spellClass: opts.klasseName,
    }));
  }

  // Zauber ERLERNEN (nicht: vorbereiten). Nur Klassen, die Zauber dauerhaft aufnehmen
  // (known-Caster + Magier-Zauberbuch). Reine Vorbereiter bekommen hier keine Auswahl —
  // ihre Vorbereitung passiert täglich außerhalb des Aufstiegs. Immer-vorbereitete
  // Merkmalszauber werden ohnehin separat automatisch ergänzt.
  const learn = learnInfo(delta, riders);
  if (learn.learns && learn.count > 0 && opts.maxSpellLevel >= 1) {
    const levels = Array.from({ length: opts.maxSpellLevel }, (_, i) => i + 1);
    qs.push(baseQuestion({
      id: 'learned_spells', type: 'spell-picker', prompt: `${learn.count} Zauber erlernen`,
      help: learn.spellbook
        ? 'Werden ins Zauberbuch eingetragen (nicht automatisch vorbereitet).'
        : 'Neu erlernte Zauber, die du fortan wirken kannst.',
      max: learn.count, spellLevels: levels, spellClass: opts.klasseName,
    }));
  }

  // Kampfstil/Expertise + sonstige erzwungene Feature-Wahlen sind NICHT mehr hier — sie
  // werden von der Merkmals-Analyse (Call 1) erkannt und am Choice-Checkpoint entschieden.
  return qs;
}

/**
 * Wandelt die von der Analyse (Call 1) erkannten Wahlen in Fragebogen-Fragen für den
 * Checkpoint. Eine `spell-pick`-Wahl wird zum `spell-picker` — der Nutzer wählt dann aus der
 * Bibliothek (gefiltert über `spellLevels`/`spellClass`) statt aus einer Options-Liste, die
 * das Modell nur erfinden könnte.
 */
export function buildFeatureChoices(choices: AnalysisChoice[]): LevelUpQuestion[] {
  return choices.map((c) =>
    baseQuestion({
      id: c.id,
      type:
        c.type === 'multiselect' ? 'multiselect'
        : c.type === 'text' ? 'text'
        : c.type === 'spell-pick' ? 'spell-picker'
        : 'choice',
      // Anzeige deutsch, Wert englisch: der Wert geht an die KI zurück und an den Charakter,
      // das Label sieht der Spieler. Fehlt die Übersetzung, steht Englisch da — der
      // Checkpoint bleibt bedienbar.
      prompt: c.questionDe.trim() || c.question,
      help: c.helpDe.trim() || c.help,
      options: c.options.map((o, i) => opt(o, optionLabel(c, i))),
      spellLevels: c.spellLevels,
      spellClass: c.spellClass,
      max: c.type === 'multiselect' || c.type === 'spell-pick' ? Math.max(1, c.max) : undefined,
      resolvesEffects: c.determinesFurtherEffects,
      featureKey: c.featureKey,
      isBuildDecision: c.isBuildDecision,
    }),
  );
}

/** Anzahl zu wählender Talente = Anzahl ASI-Stufen, für die „Talent" gewählt wurde. */
export function countFeatsToPick(delta: LevelUpDelta, answers: Record<string, string | string[]>): number {
  let n = 0;
  for (let i = 1; i <= delta.asiCount; i++) if (answers[`asi_or_feat_${i}`] === 'feat') n++;
  return n;
}
