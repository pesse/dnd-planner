/**
 * Was ein Aufstiegs-Lauf anhäuft: Eingaben des Spielers, Ergebnisse der Schritte und der
 * Stand der Maschine. Reine Datenform — gefüllt von `runSteps`, getrieben von `run`.
 */
import type { GainedFeature } from '../analysis/types';
import type { PastChoice } from '../characterFeatures';
import type { LevelUpDelta } from '../levelUp';
import type { SpellAccessGrant } from '../spellcasting/access';
import type { OptionPoolOffer } from '../declaration/optionPool';
import type { OptionPick } from '../../schemas/characterSchema';
import type { FeatureNote, FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';
import type { FeatEntry } from '../../featsLibrary';
import type { ToolItem } from '../declaration/toolProficiency';
import type { SpellInfo } from '../../spellLibrary';
import type { ChosenFeat } from './features';
import type { CategorySlot, LevelUpStyleOffer } from './featUnlocks';
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
  /** Pools, die dieser Aufstieg wachsen lässt oder offen vorfindet — sonst leer. */
  optionPools: OptionPoolOffer[];
  /**
   * Arbeitskopie der GANZEN Pool-Liste des Charakters, nicht nur der gezeigten: `poolPicks`
   * schneidet daraus, und der Picker schreibt über denselben Weg wie am Bogen.
   */
  optionPicks: OptionPick[];
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
  /** Auf eine Kategorie beschränkte Talentwahlen, die erst dieser Aufstieg freischaltet (`featUnlocks`); in `featsToPick` enthalten. */
  featSlots: CategorySlot[];
  chosenFeats: ChosenFeat[];
  /** Talent-Keys, die der Charakter vor dem Aufstieg hat (`featInstances`). */
  ownedFeats: string[];
  styleOffer: LevelUpStyleOffer | null;
  /** Talent-Keys der neuen Kampfstile. */
  chosenStyles: string[];
  styleSwaps: { from: string; to: string }[];
  /** Aus der Bibliothek gelesen — damit fällt das Talent aus dem Notiz-Eingang. */
  featAccess: SpellAccessGrant[];
  featRiders: FeatureRider[];
  validatedFeats: ValidatedRiders;
  flagged: string[];
  hpPerLevelSources: HpPerLevelSource[];
  summaryLine: string;
  featuresText: string; // Bogentext der Klassenmerkmale
  pins: string[];
  steps: string[];
  // Pro Schritt hochgezählt, damit Teilschritte im Dokument erscheinen, bevor der Lauf endet.
  reachedStep: StepId;
  spellLib: SpellInfo[];
  featLib: FeatEntry[];
  /** Die Optionen der Werkzeug-Wahl; leer lässt sie auf Freitext zurückfallen. */
  toolLib: ToolItem[];
  // Wahlen früherer Stufen: die Zauberliste einer damals gewählten Option hängt daran
  // (`optionSpellNames`).
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
    optionPools: [],
    optionPicks: [],
    baseAccess: [],
    notes: [],
    gaps: [],
    featsToPick: 0,
    featSlots: [],
    chosenFeats: [],
    ownedFeats: [],
    styleOffer: null,
    chosenStyles: [],
    styleSwaps: [],
    featAccess: [],
    featRiders: [],
    validatedFeats: emptyRiders(),
    flagged: [],
    hpPerLevelSources: [],
    summaryLine: '',
    featuresText: '',
    pins: [],
    steps: [],
    reachedStep: 'choose-class',
    spellLib: [],
    featLib: [],
    toolLib: [],
    pastChoices: [],
  };
}
