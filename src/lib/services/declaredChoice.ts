/**
 * Gerüst einer FLOW-EIGENEN Wahl — dieselbe Form, die die KI-Analyse liefert, damit
 * Oberfläche und Merkmals-Ledger nur EINEN Typ tragen; der Unterschied ist die Herkunft.
 *
 * Beide Modell-Flaggen sind false: das Merkmal steht gar nicht im KI-Eingang, eine ihm
 * unbekannte id könnte es nur einem erfundenen Rider zuordnen.
 */
import type { AnalysisChoice } from './aiActions/featureEffectsAction';

export interface DeclaredChoiceBase {
  id: string;
  /** Englischer Merkmalsname (kanonisch). */
  feature: string;
  /** Deutscher Anzeigename. */
  featureDe: string;
  featureKey: string;
}

/**
 * KI-Wahlen zu Merkmalen, deren Wahl der Flow schon führt, fallen weg — sonst wird zweimal
 * gefragt. Nötig, wo das Merkmal im KI-Eingang BLEIBT (Größe von Mensch/Tiefling): dort kann
 * kein Eingangsfilter greifen, der deutsche Speziestext braucht es weiter.
 */
export function withoutOwnedChoices(declared: AnalysisChoice[], fromAi: AnalysisChoice[]): AnalysisChoice[] {
  const owned = new Set(declared.map((c) => c.featureKey).filter(Boolean));
  return fromAi.filter((c) => !owned.has(c.featureKey));
}

export function declaredChoice(base: DeclaredChoiceBase): AnalysisChoice {
  return {
    ...base,
    question: '',
    type: 'choice',
    options: [],
    spellLevels: [],
    spellClass: '',
    help: '',
    optionHelp: {},
    max: 1,
    determinesFurtherEffects: false,
    isBuildDecision: true,
    questionDe: '',
    helpDe: '',
    optionsDe: [],
    optionHelpDe: {},
  };
}
