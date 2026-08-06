/**
 * Was ein Aufstiegs-Lauf anhäuft: Eingaben des Spielers, Ergebnisse der Schritte und der
 * Stand der Maschine. Reine Datenform — gefüllt von `runSteps`, getrieben von `run`.
 */
import type { FeatureAnalysis } from '../aiActions/featureEffectsAction';
import type { GainedFeature } from '../analysis/types';
import type { PastChoice } from '../characterFeatures';
import type { LevelUpDelta } from '../levelUp';
import type { SpellAccessGrant } from '../spellcasting/access';
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
   * Immer-vorbereitete Zauber aus Merkmalstabellen — nicht in `validatedBase`, weil sie am
   * Subklassen-Schritt hängen und auch ohne KI-Analyse stehen.
   */
  declaredSpells: DeclaredSpells;
  /** Deren Stufentabelle hängt an der CHARAKTERstufe, nicht an der Klassenstufe. */
  charLevelSpells: DeclaredSpells;
  riders: FeatureRider[];
  validatedBase: ValidatedRiders;
  decisions: LevelUpQuestion[];
  answers: Record<string, string | string[]>;
  baseAnalysis: FeatureAnalysis | null;
  baseChoices: LevelUpQuestion[];
  featAnalysis: FeatureAnalysis | null;
  featChoices: LevelUpQuestion[];
  featsToPick: number;
  chosenFeats: ChosenFeat[];
  /** Aus der Bibliothek gelesen — damit fällt das Talent aus dem KI-Eingang. */
  featAccess: SpellAccessGrant[];
  featRiders: FeatureRider[];
  validatedFeats: ValidatedRiders;
  flagged: string[];
  hpPerLevelSources: HpPerLevelSource[];
  narrativeSummary: string;
  featuresText: string; // editierbarer Volltext: KI-Merge plus Nachbearbeitung
  steps: string[];
  running: boolean;
  error: string;
  resumePhase: StepId;
  // Pro Schritt hochgezählt, damit deterministische Teilschritte im Dokument erscheinen,
  // BEVOR die nachfolgende KI-Aktion läuft.
  reachedStep: StepId;
  spellLib: SpellInfo[];
  featLib: FeatEntry[];
  // Die Analyse darf frühere Entscheidungen nicht erneut stellen und muss ihre Folgen als
  // gesetzt behandeln (Wächter ⇒ Kriegswaffen + mittlere Rüstung).
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
