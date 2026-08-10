/**
 * Die eine Zweigwahl: eine Deklaration, die je nach beantwortetem `optionList` DESSELBEN
 * Merkmals etwas anderes gewährt, schreibt `when: { option: '…' }` daran.
 */
import { pickAnswer } from './ledgerAnswers';

/** Der einzige `when`-Schlüssel, den der Flow beantworten kann. */
export const BRANCH_KEY = 'option';

/** Die Antwort, verengt auf die Zweige, die überhaupt deklariert sind. */
export function branchOf(declared: readonly (string | undefined)[], values: readonly string[]): string {
  const options = declared.map((v) => v?.trim()).filter((v): v is string => !!v);
  return options.length ? (pickAnswer(values, options) ?? '') : '';
}

/** `unknown` nennt den ersten fremden Schlüssel — melden muss ihn der Aufrufer. */
export function branchMatch(
  when: Record<string, string> | undefined,
  branch: string,
): { ok: boolean; unknown: string } {
  for (const [key, value] of Object.entries(when ?? {})) {
    if (key !== BRANCH_KEY) return { ok: false, unknown: key };
    if (value.trim() !== branch.trim()) return { ok: false, unknown: '' };
  }
  return { ok: true, unknown: '' };
}
