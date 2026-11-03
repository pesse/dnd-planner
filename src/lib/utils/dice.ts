/** Würfelformeln wie „1d8+1": Lesen, deutsch Anzeigen, Werfen. */

export interface DiceFormula {
  count: number;
  sides: number;
  bonus: number;
}

export function parseDice(formula: string): DiceFormula | null {
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(formula.replace(/\s+/g, ''));
  return m ? { count: Number(m[1] || 1), sides: Number(m[2]), bonus: Number(m[3] ?? 0) } : null;
}

export const diceDe = ({ count, sides, bonus }: DiceFormula): string =>
  `${count}W${sides}${bonus > 0 ? `+${bonus}` : bonus < 0 ? bonus : ''}`;

export interface DiceThrow {
  rolls: number[];
  total: number;
}

export function throwDice(f: DiceFormula, random: () => number = Math.random): DiceThrow {
  const rolls = Array.from({ length: f.count }, () => 1 + Math.floor(random() * f.sides));
  return { rolls, total: Math.max(0, rolls.reduce((s, r) => s + r, f.bonus)) };
}

/** Mehrere Würfelarten mit einem gemeinsamen Zuschlag, z. B. „3W8 + W6 + 2". */
export interface DicePool {
  dice: { count: number; sides: number }[];
  bonus: number;
}

export const EMPTY_POOL: DicePool = { dice: [], bonus: 0 };

/** Nimmt „W" und „d"; abgezogen werden dürfen nur Zahlen, keine Würfel. */
export function parsePool(text: string): DicePool | null {
  const s = text.replace(/\s+/g, '').replace(/w/gi, 'd');
  const terms = s.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== s) return null;
  let pool: DicePool = EMPTY_POOL;
  for (const term of terms) {
    const m = /^([+-]?)(?:(\d*)d(\d+)|(\d+))$/i.exec(term);
    if (!m) return null;
    if (m[4] != null) pool = { ...pool, bonus: pool.bonus + Number(m[1] + m[4]) };
    else if (m[1] === '-') return null;
    else pool = addToPool(pool, Number(m[3]), Number(m[2] || 1));
  }
  return pool;
}

export function addToPool(pool: DicePool, sides: number, count = 1): DicePool {
  const has = pool.dice.some((d) => d.sides === sides);
  return {
    ...pool,
    dice: has ? pool.dice.map((d) => (d.sides === sides ? { ...d, count: d.count + count } : d)) : [...pool.dice, { count, sides }],
  };
}

export function poolDe({ dice, bonus }: DicePool): string {
  const s = dice.map((d) => `${d.count}W${d.sides}`).join(' + ');
  return bonus > 0 ? `${s} + ${bonus}` : bonus < 0 ? `${s} − ${-bonus}` : s;
}

export function throwPool(pool: DicePool, random: () => number = Math.random): { dice: { sides: number; value: number }[]; total: number } {
  const dice = pool.dice.flatMap((d) => throwDice({ ...d, bonus: 0 }, random).rolls.map((value) => ({ sides: d.sides, value })));
  return { dice, total: Math.max(0, dice.reduce((s, d) => s + d.value, pool.bonus)) };
}
