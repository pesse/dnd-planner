/**
 * Das gemeinsame Änderungs-Dokument — eine reine Projektion des aktuellen Zustands, kein
 * zweiter Zustand. Die Komponente hält es als `$derived`, das Protokoll ist damit eine Sicht.
 */
import type { LevelUpDelta } from '../levelUp';
import type { Change, FeatureRider, LevelUpDoc, LevelUpQuestion } from '../../schemas/levelUp';
import type { AnalysisChoice, GainedFeature } from '../analysis/types';
import { declaredGrantChanges, type DeclaredGrantSource } from '../declaration/grants';
import { type DeclaredChoiceSource } from '../declaration/optionList';
import { characterPropertyAnswerChanges } from '../characterProperties';
import type { FeatureGrant } from '../../schemas/grants';
import type { SpellGrantSource } from '../grantedSpells';
import { answerValues } from './answers';
import { stepReached, type StepId } from './steps';
import { declaredSpellChanges, type DeclaredSpells, type ValidatedRiders } from './spells';
import {
  baseDeltaChanges,
  classFeaturesChanges,
  decisionChanges,
  featChanges,
  featureChoiceChanges,
  featureSpellChanges,
  ongoingChanges,
  riderChanges,
  riderGrantChanges,
  subclassChanges,
} from './changes';

export interface DocInput {
  delta: LevelUpDelta;
  hitDice: string;
  chosenSubclass: { key: string; name: string } | null;
  subFeatures: GainedFeature[];            // NUR die Subklassen-Merkmale (für Info-Einträge)
  /** Deterministisch gelesene, immer-vorbereitete Zauberlisten (Kreissprüche, Domäne …). */
  declaredSpells: DeclaredSpells;
  /**
   * Zauber der Merkmale, deren Stufentabelle an der CHARAKTERstufe hängt (Spezies, Talente) —
   * getrennt von `declaredSpells`, wo die KLASSENstufe gilt. Im Mehrklassen-Fall verschieden.
   */
  charLevelSpells: DeclaredSpells;
  validatedBase: ValidatedRiders;
  validatedFeats: ValidatedRiders;
  answers: Record<string, string | string[]>;
  conMod: number;
  pickedCantrips: { key: string; name: string }[];
  pickedLearned: { key: string; name: string; level: number }[];
  /** `spell.key` → Name + Grad, für Zauber-Antworten, die nur den Key tragen. */
  spellOf: (key: string) => { name: string; level: number } | undefined;
  chosenFeats: { key: string; name: string; gainedAt: number; grants?: FeatureGrant }[];
  /**
   * Quelle der Grants, die der Rider nicht ausdrücken kann. Ungefiltert, also auch die
   * Merkmale, die aus dem KI-Eingang gefallen sind.
   */
  grantSources: DeclaredGrantSource[];
  /**
   * Deklarierte Wahlen BEIDER Checkpoints, deren Antwort keinen Rider erzeugt
   * (Grundeigenschaften). Zweite Liste neben `grantSources`, weil `chosenFeats` nur
   * `grants` trägt, nicht die Wahl-Deklaration.
   */
  choiceSources: DeclaredChoiceSource[];
  baseChoiceQs: LevelUpQuestion[];
  featChoiceQs: LevelUpQuestion[];
  gainedFeatures: GainedFeature[];
  hpPerLevelSources: { feature: string; sourceKey?: string; amount: number }[];
  narrativeSummary: string;
  featuresText: string;
  upTo?: StepId; // aktueller Phasenstand: nur Änderungen bereits gelaufener Schritte aufnehmen
}

/**
 * Die Builder werden in kanonischer STEP_ORDER konkateniert — damit ist die
 * Reihenfolge-Invariante (classFeaturesText 'replace' zuletzt) strukturell garantiert
 * und ein erneut ausgeführter Schritt ersetzt nur seine eigenen Einträge.
 */
export function buildDoc(p: DocInput): LevelUpDoc {
  const nameOf = (key: string): string => p.spellOf(key)?.name ?? key;
  // Kanonische (englische) Antwort — dieselbe Ableitung, die `featureChoiceChanges` benutzt.
  const answerOf = (id: string): string => {
    const q = [...p.baseChoiceQs, ...p.featChoiceQs].find((x) => x.id === id);
    return q ? answerValues(q, p.answers[id], nameOf) : '';
  };
  const gainedAtByKey = new Map<string, number>();
  for (const f of [...p.gainedFeatures, ...p.subFeatures]) if (f.key) gainedAtByKey.set(f.key, f.gainedAt);
  for (const f of p.chosenFeats) if (f.key) gainedAtByKey.set(f.key, f.gainedAt);

  const changes: Change[] = [
    ...baseDeltaChanges(p.delta, p.hitDice),
    ...subclassChanges(p.chosenSubclass, p.subFeatures),
    ...declaredSpellChanges(p.declaredSpells),
    ...declaredSpellChanges(p.charLevelSpells, 'ongoing-effects'),
    ...riderChanges(p.validatedBase, 'feature-effects'),
    ...declaredGrantChanges(p.grantSources, { step: 'feature-effects', source: 'class-feature' }),
    ...decisionChanges({ delta: p.delta, answers: p.answers, conMod: p.conMod, pickedCantrips: p.pickedCantrips, pickedLearned: p.pickedLearned }),
    ...featureChoiceChanges(p.baseChoiceQs, p.answers, gainedAtByKey, p.delta.toLevel, 'assemble-decisions', nameOf),
    // Grundeigenschaften: der einzige Wahl-Typ ohne Rider, also braucht er hier seine eigene
    // Zeile. Beide Checkpoints in einem Aufruf — die Antwort-id trennt sie ohnehin.
    ...characterPropertyAnswerChanges(p.choiceSources, answerOf, { step: 'assemble-decisions', source: 'feature' }),
    ...featureSpellChanges(p.baseChoiceQs, p.answers, 'assemble-decisions', p.spellOf),
    ...featChanges(p.chosenFeats),
    ...riderChanges(p.validatedFeats, 'feat-effects'),
    ...declaredGrantChanges(p.chosenFeats, { step: 'feat-effects', source: 'feat' }),
    ...featureChoiceChanges(p.featChoiceQs, p.answers, gainedAtByKey, p.delta.toLevel, 'feat-effects', nameOf),
    ...featureSpellChanges(p.featChoiceQs, p.answers, 'feat-effects', p.spellOf),
    ...ongoingChanges(p.hpPerLevelSources, p.delta.levelsGained),
    ...classFeaturesChanges(p.featuresText),
  ];
  const visible = p.upTo ? changes.filter((c) => stepReached(p.upTo!, c.step)) : changes;
  return { fromLevel: p.delta.fromLevel, toLevel: p.delta.toLevel, klasse: p.delta.klasseName, summary: p.narrativeSummary, changes: visible };
}

