/**
 * Das gemeinsame Änderungs-Dokument — eine reine Projektion des aktuellen Zustands,
 * kein zweiter Zustand. Die Komponente hält es als `$derived`, das Protokoll ist damit
 * eine Sicht.
 */
import type { LevelUpDelta } from '../levelUp';
import type { Change, FeatureRider, LevelUpDoc, LevelUpQuestion } from '../../schemas/levelUp';
import type { AnalysisChoice, GainedFeature } from '../analysis/types';
import { declaredGrantChanges, type DeclaredGrantSource } from '../declaration/grants';
import { type DeclaredChoiceSource } from '../declaration/optionList';
import { characterPropertyAnswerChanges } from '../characterProperties';
import type { FeatureGrant } from '../../schemas/grants';
import type { SpellGrantSource } from '../grantedSpells';
import { answerValues, decisionNotes, recordedChoiceIds, sheetNoteLines } from './answers';
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
   * getrennt von `declaredSpells`, weil dort die KLASSENstufe gilt. Im Mehrklassen-Fall sind
   * das verschiedene Zahlen.
   */
  charLevelSpells: DeclaredSpells;
  validatedBase: ValidatedRiders;
  validatedFeats: ValidatedRiders;
  answers: Record<string, string | string[]>;
  konMod: number;
  pickedCantrips: string[];
  pickedLearned: { level: number; name: string }[];
  learnAsPrepared: boolean;
  chosenFeats: { key: string; name: string; gainedAt: number; grants?: FeatureGrant }[];
  /**
   * Die neu gewonnenen Merkmale samt Deklaration — Quelle der Grants, die der Rider nicht
   * ausdrücken kann (`declaredGrantChanges`). Ungefiltert, also auch die Merkmale, die aus
   * dem KI-Eingang gefallen sind.
   */
  grantSources: DeclaredGrantSource[];
  /**
   * Die deklarierten Wahlen BEIDER Checkpoints — nur für die, deren Antwort keinen Rider
   * erzeugt (Grundeigenschaften). Zweite Liste neben `grantSources`, weil sie die Talent-Seite
   * mit einschließt: `chosenFeats` trägt nur `grants`, nicht die Wahl-Deklaration.
   */
  choiceSources: DeclaredChoiceSource[];
  // Die Wahl-Fragebögen beider Checkpoints — Quelle der `featureChoice`-Changes; die
  // Merkmalsliste liefert dazu die Stufe je Merkmals-Key.
  baseChoiceQs: LevelUpQuestion[];
  featChoiceQs: LevelUpQuestion[];
  gainedFeatures: GainedFeature[];
  hpPerLevelSources: { feature: string; sourceKey?: string; amount: number }[];
  narrativeSummary: string;
  featuresText: string;
  upTo?: StepId; // aktueller Phasenstand: nur Änderungen bereits gelaufener Schritte aufnehmen
}

/**
 * Baut das gemeinsame LevelUp-Dokument als reine Funktion des aktuellen Zustands:
 * die Builder werden in kanonischer STEP_ORDER konkateniert (die Reihenfolge-Invariante
 * — classFeaturesText 'replace' zuletzt — ist damit strukturell garantiert). Die
 * Komponente ruft dies in einem `$derived` auf; dadurch ist das Dokument stets synchron
 * und das Protokoll eine reine Sicht darauf. Ein erneut ausgeführter Schritt (geänderte
 * Antwort, neu gewählte Subklasse) ersetzt automatisch nur seine eigenen Einträge.
 */
export function buildDoc(p: DocInput): LevelUpDoc {
  // Die kanonische (englische) Antwort einer deklarierten Wahl — dieselbe Ableitung, die
  // `featureChoiceChanges` für das Ledger benutzt.
  const answerOf = (id: string): string => {
    const q = [...p.baseChoiceQs, ...p.featChoiceQs].find((x) => x.id === id);
    return q ? answerValues(q, p.answers[id]) : '';
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
    ...decisionChanges({ delta: p.delta, answers: p.answers, konMod: p.konMod, pickedCantrips: p.pickedCantrips, pickedLearned: p.pickedLearned, learnAsPrepared: p.learnAsPrepared }),
    ...featureChoiceChanges(p.baseChoiceQs, p.answers, gainedAtByKey, p.delta.toLevel, 'assemble-decisions'),
    // Grundeigenschaften: der einzige Wahl-Typ ohne Rider, also braucht er hier seine eigene
    // Zeile. Beide Checkpoints in einem Aufruf — die Antwort-id trennt sie ohnehin.
    ...characterPropertyAnswerChanges(p.choiceSources, answerOf, { step: 'assemble-decisions', source: 'feature' }),
    ...featureSpellChanges(p.baseChoiceQs, p.answers, 'assemble-decisions'),
    ...decisionNotes(p.validatedBase.riders, 'assemble-decisions', recordedChoiceIds(p.baseChoiceQs, p.answers)),
    ...featChanges(p.chosenFeats),
    ...riderChanges(p.validatedFeats, 'feat-effects'),
    ...declaredGrantChanges(p.chosenFeats, { step: 'feat-effects', source: 'feat' }),
    ...featureChoiceChanges(p.featChoiceQs, p.answers, gainedAtByKey, p.delta.toLevel, 'feat-effects'),
    ...featureSpellChanges(p.featChoiceQs, p.answers, 'feat-effects'),
    ...decisionNotes(p.validatedFeats.riders, 'feat-effects', recordedChoiceIds(p.featChoiceQs, p.answers)),
    ...ongoingChanges(p.hpPerLevelSources, p.delta.levelsGained),
    ...classFeaturesChanges(p.featuresText),
  ];
  // Nur Änderungen bereits erreichter Schritte zeigen (kein Vorgriff auf künftige Schritte).
  const visible = p.upTo ? changes.filter((c) => stepReached(p.upTo!, c.step)) : changes;
  return { fromLevel: p.delta.fromLevel, toLevel: p.delta.toLevel, klasse: p.delta.klasseName, summary: p.narrativeSummary, changes: visible };
}

