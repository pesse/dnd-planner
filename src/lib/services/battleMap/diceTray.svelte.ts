/** Ob die Würfel-Box offen ist und welcher Wurf in ihr liegt — überdauert das Schließen der Karte. */
export const diceTray = $state({ open: false, formula: '' });

/** Öffnet die Box mit diesem Wurf, ohne ihn schon zu werfen. */
export function prepareRoll(formula: string): void {
  diceTray.formula = formula;
  diceTray.open = true;
}
