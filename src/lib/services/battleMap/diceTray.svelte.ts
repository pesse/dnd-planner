/** Würfel-Box der Karte: ob sie offen ist, welcher Wurf in ihr liegt, und das Werfen selbst. */
import { diceLog, logRoll } from './diceLog.svelte';
import { addedRoll, thrownRoll } from './rollMath';

/** `shared`: Würfe erscheinen auch im Spielerfenster. */
export const diceTray = $state({ open: false, formula: '', shared: false });

/** Wirft den Wurf und legt ihn in den Verlauf; `false`, wenn er nicht zu werfen ist. */
export function rollFormula(formula: string): boolean {
  const roll = thrownRoll(formula);
  if (roll) logRoll(roll);
  return !!roll;
}

/** Ersetzt den letzten Wurf durch die Summe mit `formula`; ohne addierbaren Wurf ein neuer. */
export function addToLatest(formula: string): boolean {
  const [latest, ...rest] = diceLog.rolls;
  const sum = addedRoll(latest, formula);
  if (!sum) return rollFormula(formula);
  diceLog.rolls = rest;
  logRoll(sum);
  return true;
}

/** Ein Würfelverweis im Text: Box auf und gleich werfen; `add` (Strg+Klick) legt ihn zum letzten Wurf. */
export function rollNow(formula: string, add = false): void {
  diceTray.open = true;
  if (add) addToLatest(formula);
  else rollFormula(formula);
}
