/**
 * Die Auswertung von `when` (`schemas/when.ts`): eine Deklaration, die je nach Zweigwahl oder
 * Pool-Wahl DESSELBEN Merkmals etwas anderes gewährt.
 */
import type { OptionPick } from '../../schemas/characterSchema';
import type { FeatureChoiceGrant } from '../../schemas/featureChoice';
import { ledgerAnswers, pickAnswer, type LedgerAnswerEntry } from './ledgerAnswers';

/** Antwort des `optionList`. */
export const BRANCH_KEY = 'option';
/** Option unter den Wahlen des `optionPool`. */
export const PICK_KEY = 'pick';

/** Was an einer Instanz entschieden ist, soweit `when` es prüfen kann. */
export interface BranchState {
  branch: string;
  /** Englische Options-Werte aus `character.optionPicks` dieses Merkmals. */
  picks: readonly string[];
}

/** Die Antwort, verengt auf die Zweige, die überhaupt deklariert sind. */
export function branchOf(declared: readonly (string | undefined)[], values: readonly string[]): string {
  const options = declared.map((v) => v?.trim()).filter((v): v is string => !!v);
  return options.length ? (pickAnswer(values, options) ?? '') : '';
}

/** Die `option`-Werte einer Reihe von Bedingungen — das Argument für `branchOf`. */
export const branchValues = (whens: readonly (Record<string, string> | undefined)[]): (string | undefined)[] =>
  whens.map((w) => w?.[BRANCH_KEY]);

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** `unknown` nennt den ersten fremden Schlüssel — melden muss ihn der Aufrufer. */
export function branchMatch(
  when: Record<string, string> | undefined,
  state: BranchState,
): { ok: boolean; unknown: string } {
  for (const [key, value] of Object.entries(when ?? {})) {
    if (key === BRANCH_KEY) {
      if (value.trim() !== state.branch.trim()) return { ok: false, unknown: '' };
    } else if (key === PICK_KEY) {
      if (!state.picks.some((p) => same(p, value))) return { ok: false, unknown: '' };
    } else return { ok: false, unknown: key };
  }
  return { ok: true, unknown: '' };
}

/**
 * Der Zustand, gegen den die `when` der WAHLEN eines Merkmals prüfen. Ohne Vergabe-Stufe: eine
 * Talentwahl mit Bedingung hängt an einer Antwort, die das Merkmal einmal trägt.
 */
export function choiceBranchState(
  f: { key?: string; grantsChoice?: FeatureChoiceGrant[] },
  ledger: readonly LedgerAnswerEntry[],
  picks: readonly OptionPick[],
): BranchState {
  const key = f.key ?? '';
  return {
    branch: branchOf(branchValues((f.grantsChoice ?? []).map((g) => g.when)), ledgerAnswers(ledger, key)),
    picks: picks.filter((p) => p.sourceKey === key).map((p) => p.value),
  };
}

/** Ohne Zustand gilt nur die unbedingte Wahl — eine offene Antwort schaltet nichts frei. */
export const choiceActive = (g: FeatureChoiceGrant, state?: BranchState): boolean =>
  !g.when || (!!state && branchMatch(g.when, state).ok);
