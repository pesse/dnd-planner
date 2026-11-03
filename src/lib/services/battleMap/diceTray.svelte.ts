/** Würfel-Box der Karte: ob sie offen ist, welcher Wurf in ihr liegt, und das Werfen selbst. */
import { parsePool, poolDe, throwPool, type DicePool } from '../../utils/dice';
import { logRoll, type Roll } from './diceLog.svelte';

/** `shared`: Würfe erscheinen auch im Spielerfenster. */
export const diceTray = $state({ open: false, formula: '', shared: false });

const LIMIT = { count: 100, sides: 1000 };

export const critOf = (d20: number): Roll['crit'] => (d20 === 20 ? 'hit' : d20 === 1 ? 'miss' : null);

function rollable(pool: DicePool | null): pool is DicePool {
  const count = pool?.dice.reduce((n, d) => n + d.count, 0) ?? 0;
  return !!pool && count > 0 && count <= LIMIT.count && pool.dice.every((d) => d.sides >= 2 && d.sides <= LIMIT.sides);
}

/** Wirft den Wurf und legt ihn in den Verlauf; `false`, wenn er nicht zu werfen ist. */
export function rollFormula(formula: string): boolean {
  const pool = parsePool(formula);
  if (!rollable(pool)) return false;
  const t = throwPool(pool);
  const label = poolDe(pool);
  const single = t.dice.length === 1 && t.dice[0].sides === 20;
  logRoll({ formula: label, label, dice: t.dice, kept: null, bonus: pool.bonus, total: t.total, crit: single ? critOf(t.dice[0].value) : null });
  return true;
}

/** Ein Würfelverweis im Text: Box auf und gleich werfen. */
export function rollNow(formula: string): void {
  diceTray.open = true;
  rollFormula(formula);
}
