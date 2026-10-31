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
