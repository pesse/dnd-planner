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
  /** Was die Würfelkörper zeigen. */
  faces: { sides: number; value: number }[];
  total: number;
}

export function throwDice(f: DiceFormula, random: () => number = Math.random): DiceThrow {
  // Einen W3-Körper gibt es nicht: geworfen wird ein W6, halbiert und aufgerundet.
  const body = f.sides === 3 ? 6 : f.sides;
  const faces = Array.from({ length: f.count }, () => ({ sides: body, value: 1 + Math.floor(random() * body) }));
  const sum = faces.reduce((s, d) => s + (f.sides === 3 ? Math.ceil(d.value / 2) : d.value), 0);
  return { faces, total: Math.max(0, sum + f.bonus) };
}
