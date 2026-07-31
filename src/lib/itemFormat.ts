/** Einheiten und Zahlenformate der Gegenstands-Anzeige (Fuß→Meter, Münzen, Würfel). */
import { COST_UNIT_LABELS, RARITY_LABELS } from './itemLabels';

/** Fuß → Meter als Zahl (1,5 m pro 5 ft). */
export function ftToMVal(ft: number): number {
  const m = ft * 0.3;
  return parseFloat(m.toFixed(1));
}

/** Fuß → Meter als formatierter String. */
export function ftToM(ft: number): string {
  return ftToMVal(ft) + ' m';
}

/** Meter → Fuß (gerundet auf 5 ft). */
export function mToFt(m: number): number {
  return Math.round(m / 0.3 / 5) * 5 || Math.round(m / 0.3);
}

export function formatCost(cost: { quantity: number; unit: string }): string {
  return `${cost.quantity} ${COST_UNIT_LABELS[cost.unit] ?? cost.unit}`;
}

export function formatRarity(rarity: { name: string } | undefined): string {
  if (!rarity) return '—';
  return RARITY_LABELS[rarity.name] ?? rarity.name;
}

export function formatDamageDice(dice: string): string {
  return dice.replace(/\bd(\d+)\b/gi, (_, n) => `W${n}`);
}
