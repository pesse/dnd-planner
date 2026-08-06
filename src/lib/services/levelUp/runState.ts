/**
 * Was ein Aufstiegs-Lauf anhäuft: Eingaben des Spielers, Ergebnisse der Schritte und der
 * Stand der Maschine. Reine Datenform — gefüllt von `runSteps`, getrieben von `run`.
 */
import type { GainedFeature } from '../analysis/types';
import type { PastChoice } from '../characterFeatures';
import type { LevelUpDelta } from '../levelUp';
import type { SpellAccessGrant } from '../spellcasting/access';
import type { FeatureNote, FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';
import type { FeatEntry } from '../../featsLibrary';
import type { SpellInfo } from '../../spellLibrary';
import type { ChosenFeat } from './features';
import { noDeclaredSpells, type DeclaredSpells, type ValidatedRiders } from './spells';
import type { StepId } from './steps';

export interface HpPerLevelSource { feature: string; sourceKey: string; amount: number }

/** `running` und `error` tragen den Schritt selbst — dorthin fällt ein Abbruch oder Fehler zurück. */
export type RunPhase =
  | { kind: 'idle' }
  | { kind: 'running'; step: StepId }
  | { kind: 'paused'; at: StepId }
  | { kind: 'error'; at: StepId; message: string };

/** Der Schritt, den die aktuelle Ansicht zeigt — `idle` liegt vor jedem Lauf an `choose-class`. */
export function stepOf(run: RunPhase): StepId {
  switch (run.kind) {
    case 'idle': return 'choose-class';
    case 'running': return run.step;
    case 'paused': return run.at;
    case 'error': return run.at;
  }
}

/** Sichtbarer Checkpoint: während eines Laufs ist keiner sichtbar, ein Fehler zeigt seinen. */
export function isPausedAt(run: RunPhase, step: StepId): boolean {
  return run.kind !== 'running' && stepOf(run) === step;
}

export interface LevelUpRunState {
  run: RunPhase;
  delta: LevelUpDelta | null;
  chosenSubclass: { key: string; name: string } | null;
  subFeatures: GainedFeature[];    // NUR Subklassen-Merkmale (Info-Einträge im Dokument)
  gainedFeatures: GainedFeature[]; // Klassen- + Subklassen-Merkmale (Notiz-Eingang + UI-Liste)
  /**
   * Immer-vorbereitete Zauber aus Merkmalstabellen — nicht in `validatedBase`, weil sie am
   * Subklassen-Schritt hängen.
   */
  declaredSpells: DeclaredSpells;
  /** Deren Stufentabelle hängt an der CHARAKTERstufe, nicht an der Klassenstufe. */
  charLevelSpells: DeclaredSpells;
  riders: FeatureRider[];
  validatedBase: ValidatedRiders;
  decisions: LevelUpQuestion[];
  answers: Record<string, string | string[]>;
  /** Aus der Progression gelesen — damit fällt das Klassenmerkmal aus dem Notiz-Eingang. */
  baseAccess: SpellAccessGrant[];
  /** Bogenzeilen des Notiz-Passes, Basis- und Talentmerkmale in einem Satz. */
  notes: FeatureNote[];
  /**
   * Merkmale, deren Prosa eine Mechanik ankündigt, für die keine Deklaration steht — sie
   * fällt aus, und das darf nicht still passieren (`declarationGapLines`).
   */
  gaps: string[];
  featsToPick: number;
  chosenFeats: ChosenFeat[];
  /** Aus der Bibliothek gelesen — damit fällt das Talent aus dem Notiz-Eingang. */
  featAccess: SpellAccessGrant[];
  featRiders: FeatureRider[];
  validatedFeats: ValidatedRiders;
  flagged: string[];
  hpPerLevelSources: HpPerLevelSource[];
  narrativeSummary: string;
  featuresText: string; // editierbarer Volltext: KI-Merge plus Nachbearbeitung
  steps: string[];
  // Pro Schritt hochgezählt, damit deterministische Teilschritte im Dokument erscheinen,
  // BEVOR die nachfolgende KI-Aktion läuft.
  reachedStep: StepId;
  spellLib: SpellInfo[];
  featLib: FeatEntry[];
  // Wahlen früherer Stufen: die Zauberliste einer damals gewählten Option hängt daran
  // (`optionSpellNames`), und das Narrativ soll sie nicht als neu ausgeben.
  pastChoices: PastChoice[];
}

export const emptyRiders = (): ValidatedRiders => ({ riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] });

export function emptyRunState(): LevelUpRunState {
  return {
    run: { kind: 'idle' },
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
    baseAccess: [],
    notes: [],
    gaps: [],
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
    reachedStep: 'choose-class',
    spellLib: [],
    featLib: [],
    pastChoices: [],
  };
}
