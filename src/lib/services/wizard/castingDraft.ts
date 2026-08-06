/**
 * Der Charakter, wie er gerade IM WIZARD aussieht — Links, Merkmals-Ledger, Attribute. Mehr
 * liest die Zauber-Auflösung nicht, und ohne sie kennt sie weder die Zweigwahl noch das
 * Talent des Hintergrunds. Gegenstück zu `castingInput` des Editors
 * (`services/characterFormCasting.svelte.ts`); die Montage baut denselben Charakter zu Ende.
 */
import { formatClassLevel, formatSpecies } from '$lib/schemas/classLevelText';
import { characterSchema, type Character, type CharacterFeatureEntry } from '$lib/schemas/characterSchema';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import { mod } from '$lib/domain/skills';
import { choiceLabelsDe, type AnalysisChoice } from '../analysis/types';
import type { DeclaredAnswer } from '../declaredChoice';
import { cloneSpellcasting } from '../spellcasting/write';
import { applyAsi, type AsiAllocation } from './backgroundAsi';
import { ABILITY_KEYS, type AbilityScores } from './pointBuy';

/** Strukturell statt nominal: `CharacterWizard` erfüllt das, ein Testobjekt ebenso. */
export interface WizardCastingSource {
  klass: { sourceKey: string; name: string; subclassKey?: string; subclassName?: string };
  species: { sourceKey: string; name: string; subspeciesKey?: string; subspeciesName?: string };
  background: { sourceKey: string; name: string };
  declaredChoices: AnalysisChoice[];
  declaredAnswers: DeclaredAnswer[];
  fightingStyles: string[];
  scores: AbilityScores;
  asi: AsiAllocation;
  spellcasting: CharacterSpellcasting;
}

export function applyLinks(c: Character, w: WizardCastingSource): void {
  c.classes = [{
    sourceKey: w.klass.sourceKey,
    name: w.klass.name,
    ...(w.klass.subclassKey ? { subclassKey: w.klass.subclassKey, subclassName: w.klass.subclassName } : {}),
    level: 1,
  }];
  c.species = {
    sourceKey: w.species.sourceKey,
    name: w.species.name,
    ...(w.species.subspeciesKey ? { subspeciesKey: w.species.subspeciesKey, subspeciesName: w.species.subspeciesName } : {}),
  };
  c.backgroundRef = { sourceKey: w.background.sourceKey, name: w.background.name };
  c.classLevel = formatClassLevel(c.classes);
  c.race = formatSpecies(c.species);
  c.background = w.background.name;
}

/**
 * Zauber-Wahlen tragen `isBuildDecision: false` und fallen hier durch — sie stehen im
 * Zauber-Block, nicht im Merkmals-Ledger.
 */
export function applyFeatureLedger(c: Character, w: WizardCastingSource): void {
  const byId = new Map(w.declaredChoices.map((ch) => [ch.id, ch]));
  for (const rc of w.declaredAnswers) {
    const ch = byId.get(rc.id);
    if (!ch?.isBuildDecision || !ch.featureKey) continue;
    // `choice` englisch (Prompt-Kanal späterer Stufen), `choiceDe` als Anzeige.
    c.features.push({
      sourceKey: ch.featureKey,
      name: '',
      choice: rc.choice,
      choiceDe: choiceLabelsDe(ch, rc.choice),
      choiceId: ch.id,
      gainedAt: 1,
      desc: '',
    });
  }
}

/** Ohne Anzeigenamen — den holt die Montage aus der Talent-Bibliothek. */
export const fightingStyleLinks = (w: WizardCastingSource): CharacterFeatureEntry[] =>
  w.fightingStyles.map((key) => ({ sourceKey: key, name: '', choice: '', choiceDe: '', choiceId: '', gainedAt: 1, desc: '' }));

/** Point-Buy + Hintergrund-ASI; die Erhöhungen der Merkmals-Rider legt die Montage darauf. */
export const draftScores = (w: WizardCastingSource): AbilityScores => applyAsi(w.scores, w.asi);

export function applyScores(c: Character, scores: AbilityScores): void {
  c.abilities = { ...scores };
  c.mods = Object.fromEntries(ABILITY_KEYS.map((k) => [k, mod(scores[k])])) as AbilityScores;
}

/**
 * Synchron, weil der `$effect` des Zauber-Schritts sonst seine Abhängigkeiten verliert — was
 * die Auflösung an Bibliotheken braucht, lädt sie selbst. Das Talent des Hintergrunds steht
 * bewusst nicht im Ledger: `featInstances` zieht es aus `backgroundRef`.
 */
export function wizardCastingInput(w: WizardCastingSource): Character {
  const c = characterSchema.parse({ name: 'Entwurf' });
  applyLinks(c, w);
  applyFeatureLedger(c, w);
  c.features.push(...fightingStyleLinks(w));
  applyScores(c, draftScores(w));
  c.spellcasting = cloneSpellcasting(w.spellcasting);
  return c;
}
