/**
 * Der Spieler-Fragebogen, deterministisch aus Delta, Ridern und Deklarationen
 * abgeleitet. Keine KI: was hier gefragt wird, steht in Regeln oder Bibliothek.
 */
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { FIGHTING_STYLE_CATEGORY } from '../fightingStyle';
import { choiceGrants } from '../declaration/source';
import { skillLabelDe, abilityLabelDe } from '../proficiencyGrants';
import { withoutDeclaredChoiceFeatures, type DeclaredChoiceSource } from '../declaration/optionList';
import { ABILITY_KEYS, ABILITY_LABEL } from '../../schemas/abilities';
import type { FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';
import { optionLabel, type AnalysisChoice } from '../analysis/types';
import type { SpellGrantSource } from '../grantedSpells';
import { withoutSpellGrantFeatures } from '../grantedSpells';
import { learnInfo } from './spells';
import { ASI_ABILITY_MAX, ASI_FEAT_VALUE, asiQuestionId, readAsiPick } from './asi';

const opt = (value: string, label: string) => ({ value, label });
const baseQuestion = (q: Partial<LevelUpQuestion> & { id: string; type: LevelUpQuestion['type']; prompt: string }): LevelUpQuestion => ({
  help: '', options: [], defaultValue: '', required: true, spellLevels: [], spellClass: '', spellSchools: [],
  spellTier: 'prepared', sourceId: '', quotaId: '',
  featureKey: '', isBuildDecision: false, ...q,
});

/** `maxSpellLevel` begrenzt die im Picker wählbaren Grade. */
export function buildDecisions(
  delta: LevelUpDelta,
  riders: FeatureRider[],
  opts: { maxSpellLevel: number; klasseName: string },
): LevelUpQuestion[] {
  const qs: LevelUpQuestion[] = [];

  // Bei „Würfeln" wird tatsächlich gewürfelt, nicht getippt; die Karte zeigt beides als Kacheln.
  if (delta.hitDie > 0) {
    qs.push(baseQuestion({
      id: 'hp_method', type: 'choice', prompt: 'Trefferpunkte bestimmen',
      options: [opt('average', 'Durchschnitt'), opt('roll', 'Würfeln')], defaultValue: 'average',
    }));
    qs.push(baseQuestion({
      id: 'hp_roll', type: 'hp-roll',
      prompt: delta.levelsGained > 1 ? `Trefferwürfel auswürfeln (${delta.levelsGained}×W${delta.hitDie})` : `Trefferwürfel auswürfeln (W${delta.hitDie})`,
      required: false,
      dieSides: delta.hitDie, rollCount: delta.levelsGained,
    }));
  }

  for (let i = 1; i <= delta.asiCount; i++) {
    qs.push(baseQuestion({
      id: asiQuestionId(i), type: 'ability-boost',
      prompt: delta.asiCount > 1 ? `Attributsverbesserung ${i}` : 'Attributsverbesserung',
      help: `Höchstens ${ASI_ABILITY_MAX} je Attribut.`,
      options: [opt(ASI_FEAT_VALUE, 'Talent'), ...ABILITY_KEYS.map((k) => opt(k, ABILITY_LABEL[k]))],
    }));
  }

  const cantripGain = delta.cantripDelta + riders.reduce((s, r) => s + r.extraCantrips, 0);
  if (cantripGain > 0) {
    qs.push(baseQuestion({
      id: 'cantrips', type: 'spell-picker', prompt: `${cantripGain} neue(n) Zaubertrick(s) wählen`,
      max: cantripGain, spellLevels: [0], spellClass: opts.klasseName,
    }));
  }

  // Zauber ERLERNEN, nicht vorbereiten: die Vorbereitung passiert täglich außerhalb des
  // Aufstiegs, immer-vorbereitete Merkmalszauber kommen separat dazu.
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

  return qs;
}

/**
 * Eine optionslose Auswahlfrage blockiert als Pflichtfrage den Checkpoint dauerhaft, also
 * entfällt sie. `text` und `spell-pick` beziehen ihre Eingabe nicht aus `options`.
 */
const isAnswerable = (c: AnalysisChoice): boolean =>
  c.type === 'text' || c.type === 'spell-pick' || c.options.length > 0;

/** Eine `spell-pick`-Wahl wird zum `spell-picker`, dessen Optionen `vault/spells` liefert. */
export function buildFeatureChoices(choices: AnalysisChoice[]): LevelUpQuestion[] {
  return choices.filter(isAnswerable).map((c) =>
    baseQuestion({
      id: c.id,
      type:
        c.type === 'multiselect' ? 'multiselect'
        : c.type === 'text' ? 'text'
        : c.type === 'spell-pick' ? 'spell-picker'
        : 'choice',
      // Anzeige deutsch, Wert englisch. Ohne deutschen Wortlaut steht Englisch da — der
      // Checkpoint bleibt bedienbar.
      prompt: c.questionDe.trim() || c.question,
      help: c.helpDe.trim(),
      options: c.options.map((o, i) => opt(o, optionLabel(c, i))),
      spellLevels: c.spellLevels,
      spellClass: c.spellClass,
      spellSchools: c.spellSchools,
      spellTier: c.spellTier,
      sourceId: c.sourceId,
      quotaId: c.quotaId,
      max: c.type === 'multiselect' || c.type === 'spell-pick' ? Math.max(1, c.max) : undefined,
      featureKey: c.featureKey,
      isBuildDecision: c.isBuildDecision,
    }),
  );
}

/**
 * Eine Talentkategorie außer Kampfstil (Epische Gabe) ist eine freie Talentwahl wie die der
 * Attributswerterhöhung — der Regeltext erlaubt „or another feat of your choice". Der Kampfstil
 * hat seinen eigenen Picker.
 */
function featCategoryPicks(delta: LevelUpDelta): number {
  let n = 0;
  for (const f of [...delta.featuresGained, ...delta.subclassFeaturesGained]) {
    const times = f.gainedAt.filter((l) => l > delta.fromLevel && l <= delta.toLevel).length;
    for (const g of choiceGrants(f))
      if (g.kind === 'featCategory' && g.featCategory !== FIGHTING_STYLE_CATEGORY && !g.when) n += times * g.count;
  }
  return n;
}

/** `conditional`: bedingte Talentwahlen, die erst dieser Aufstieg freischaltet (`featUnlocks`). */
export function countFeatsToPick(delta: LevelUpDelta, answers: Record<string, string | string[]>, conditional = 0): number {
  let n = featCategoryPicks(delta) + conditional;
  for (let i = 1; i <= delta.asiCount; i++) if (readAsiPick(answers[asiQuestionId(i)])?.kind === 'feat') n++;
  return n;
}
