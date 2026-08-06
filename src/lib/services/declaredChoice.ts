/**
 * Gerüst einer deklarierten Wahl — eine Form für alle Wahl-Arten, damit Oberfläche und
 * Merkmals-Ledger nur EINEN Typ tragen.
 */
import type { AnalysisChoice } from './analysis/types';

/**
 * Die Antwort auf eine Wahl, kanonisch (englisch). Als Liste statt als Record, weil der
 * Wizard sie in dieser Form durch seine Schritte trägt — der Aufstieg führt seine Antworten
 * dagegen als `answers`-Record am Lauf-Zustand.
 */
export interface DeclaredAnswer {
  id: string;
  choice: string;
}

export interface DeclaredChoiceBase {
  id: string;
  /** Englischer Merkmalsname (kanonisch). */
  feature: string;
  /** Deutscher Anzeigename. */
  featureDe: string;
  featureKey: string;
}

export function declaredChoice(base: DeclaredChoiceBase): AnalysisChoice {
  return {
    ...base,
    question: '',
    type: 'choice',
    options: [],
    spellLevels: [],
    spellClass: '',
    spellSchools: [],
    spellTier: 'prepared',
    sourceId: '',
    quotaId: '',
    max: 1,
    isBuildDecision: true,
    questionDe: '',
    helpDe: '',
    optionsDe: [],
    optionHelpDe: {},
  };
}
