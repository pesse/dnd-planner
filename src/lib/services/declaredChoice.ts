/**
 * Gerüst einer FLOW-EIGENEN Wahl — dieselbe Form, die die KI-Analyse liefert, damit
 * Oberfläche und Merkmals-Ledger nur EINEN Typ tragen; der Unterschied ist die Herkunft.
 */
import type { AnalysisChoice } from './analysis/types';

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
 * gefragt. Nötig für Merkmale, die im KI-Eingang BLEIBEN (mit `grants` aber ohne deklarierte
 * Wahl, und Zweigwahlen mit undeklarierter Option): dort greift kein Eingangsfilter.
 */
export function withoutOwnedChoices(declared: AnalysisChoice[], fromAi: AnalysisChoice[]): AnalysisChoice[] {
  const owned = new Set(declared.map((c) => c.featureKey).filter(Boolean));
  return fromAi.filter((c) => !owned.has(c.featureKey));
}

/**
 * `determinesFurtherEffects: false` ist Absicht: das Merkmal steht gar nicht im KI-Eingang,
 * eine ihm unbekannte id könnte das Modell nur einem erfundenen Rider zuordnen.
 */
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
