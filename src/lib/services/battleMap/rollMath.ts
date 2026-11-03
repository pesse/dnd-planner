/** Würfe der Würfel-Box als reine Rechnung. */
import { addToPool, parsePool, poolDe, throwPool, type DicePool } from '../../utils/dice';
import type { Roll } from './diceLog.svelte';

const LIMIT = { count: 100, sides: 1000 };

export const critOf = (d20: number): Roll['crit'] => (d20 === 20 ? 'hit' : d20 === 1 ? 'miss' : null);

export function rollable(pool: DicePool | null): pool is DicePool {
  const count = pool?.dice.reduce((n, d) => n + d.count, 0) ?? 0;
  return !!pool && count > 0 && count <= LIMIT.count && pool.dice.every((d) => d.sides >= 2 && d.sides <= LIMIT.sides);
}

export function thrownRoll(formula: string, random?: () => number): Omit<Roll, 'id'> | null {
  const pool = parsePool(formula);
  if (!rollable(pool)) return null;
  const t = throwPool(pool, random);
  const label = poolDe(pool);
  const single = t.dice.length === 1 && t.dice[0].sides === 20;
  return { formula: label, label, dice: t.dice, kept: null, bonus: pool.bonus, total: t.total, crit: single ? critOf(t.dice[0].value) : null };
}

/**
 * `latest` plus frisch geworfene `formula` als EIN Wurf — „1W6 Wucht und 2W8 Stich" übernimmt
 * Schaden/Heilung so als Ganzes. `null`, wenn `latest` keine Formel hat (Vorteil/Nachteil).
 */
export function addedRoll(latest: Roll | undefined, formula: string, random?: () => number): Omit<Roll, 'id'> | null {
  const base = latest?.formula ? parsePool(latest.formula) : null;
  const pool = parsePool(formula);
  if (!latest || !base || !rollable(pool)) return null;
  const merged = pool.dice.reduce((p, d) => addToPool(p, d.sides, d.count), { ...base, bonus: base.bonus + pool.bonus });
  if (!rollable(merged)) return null;
  const t = throwPool(pool, random);
  const label = poolDe(merged);
  return { formula: label, label, dice: [...latest.dice, ...t.dice], kept: null, bonus: merged.bonus, total: latest.total + t.total, crit: null };
}
