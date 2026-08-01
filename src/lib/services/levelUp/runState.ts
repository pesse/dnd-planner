/**
 * Was ein Aufstiegs-Lauf anhäuft: Eingaben des Spielers, Ergebnisse der Schritte und der
 * Stand der Maschine. Reine Datenform — gefüllt von `runSteps`, getrieben von `run`.
 */
import type { FeatureAnalysis } from '../aiActions/featureEffectsAction';
import type { GainedFeature } from '../analysis/types';
import type { PastChoice } from '../characterFeatures';
import type { LevelUpDelta } from '../levelUp';
import type { SpellAccessGrant } from '../spellAccess';
import type { FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';
import type { FeatEntry } from '../../featsLibrary';
import type { SpellInfo } from '../../spellLibrary';
import type { ChosenFeat } from './features';
import { noDeclaredSpells, type DeclaredSpells, type ValidatedRiders } from './spells';
import type { StepId } from './steps';

export interface HpPerLevelSource { feature: string; sourceKey: string; amount: number }

export interface LevelUpRunState {
  phase: StepId | 'running';
  delta: LevelUpDelta | null;
  chosenSubclass: { key: string; name: string } | null;
  subFeatures: GainedFeature[];    // NUR Subklassen-Merkmale (Info-Einträge im Dokument)
  gainedFeatures: GainedFeature[]; // Klassen- + Subklassen-Merkmale (KI-Input + UI-Liste)
  /**
   * Immer-vorbereitete Zauber aus Merkmalstabellen (Kreissprüche, Domänenzauber …) —
   * deterministisch gelesen, deshalb hier und nicht in `validatedBase`: sie hängen am
   * Subklassen-Schritt und stehen auch ohne KI-Analyse.
   */
  declaredSpells: DeclaredSpells;
  /** Zauber aus Spezies- und Talent-Deklarationen — deren Stufentabelle hängt an der
   *  CHARAKTERstufe, nicht an der Klassenstufe (Mehrklassen: verschiedene Zahlen). */
  charLevelSpells: DeclaredSpells;
  riders: FeatureRider[];
  validatedBase: ValidatedRiders;
  decisions: LevelUpQuestion[];
  answers: Record<string, string | string[]>;
  // Merkmals-/Talent-Analyse (Call 1) + die daraus abgeleiteten Wahl-Fragen für den
  // Checkpoint DIREKT nach Call 1. Der finalisierende Effekt-Call (Call C) bäckt die
  // getroffene Entscheidung ein — kein iterativer Loop mehr.
  baseAnalysis: FeatureAnalysis | null;
  baseChoices: LevelUpQuestion[];
  featAnalysis: FeatureAnalysis | null;
  featChoices: LevelUpQuestion[];
  featsToPick: number;
  chosenFeats: ChosenFeat[];
  /**
   * Deklarierter Zauber-Zugang der gewählten Talente („Eingeweihter der Magie") — am Schritt
   * `feat-links` aus der Bibliothek gelesen. Damit fällt das Talent aus dem KI-Eingang.
   */
  featAccess: SpellAccessGrant[];
  featRiders: FeatureRider[];
  validatedFeats: ValidatedRiders;
  flagged: string[];
  /** Pro-Stufe-TP-Max aus dem Voll-Kontext-Effekt-Pass (z.B. Zwergische Zähigkeit). */
  hpPerLevelSources: HpPerLevelSource[];
  narrativeSummary: string; // KI-Narrativ (Zusammenfassung) → doc.summary
  featuresText: string; // editierbarer Klassenmerkmale-Volltext (KI-Merge + Nachbearbeitung)
  steps: string[];
  running: boolean;
  error: string;
  resumePhase: StepId;
  // Weitester bereits abgeschlossener Schritt — steuert, was das Dokument WÄHREND eines
  // Laufs zeigt. Wird pro Schritt hochgezählt, damit deterministische Teilschritte (z.B.
  // Subklassen-Delta) im JSON erscheinen, BEVOR die nachfolgende KI-Aktion läuft.
  reachedStep: StepId;
  spellLib: SpellInfo[];
  featLib: FeatEntry[];
  // Entscheidungen früherer Stufen: die Analyse darf sie nicht erneut stellen und muss
  // ihre Folgen als gesetzt behandeln (Wächter ⇒ Kriegswaffen + mittlere Rüstung).
  pastChoices: PastChoice[];
}

export const emptyRiders = (): ValidatedRiders => ({ riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] });

export function emptyRunState(): LevelUpRunState {
  return {
    phase: 'choose-class',
    delta: null,
    chosenSubclass: null,
    subFeatures: [],
    gainedFeatures: [],
    declaredSpells: noDeclaredSpells(),
    charLevelSpells: noDeclaredSpells(),
    riders: [],
    validatedBase: emptyRiders(),
    decisions: [],
    answers: {},
    baseAnalysis: null,
    baseChoices: [],
    featAnalysis: null,
    featChoices: [],
    featsToPick: 0,
    chosenFeats: [],
    featAccess: [],
    featRiders: [],
    validatedFeats: emptyRiders(),
    flagged: [],
    hpPerLevelSources: [],
    narrativeSummary: '',
    featuresText: '',
    steps: [],
    running: false,
    error: '',
    resumePhase: 'choose-class',
    reachedStep: 'choose-class',
    spellLib: [],
    featLib: [],
    pastChoices: [],
  };
}
