/** Einheiten und Zahlenformate der Gegenstands-Anzeige (Fuß→Meter, Münzen, Würfel). */
import { COST_UNIT_LABELS, DAMAGE_TYPE_LABELS, RARITY_LABELS } from './itemLabels';

type DamageRef = { damage_dice: string; damage_type: { index: string; name: string } };

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

/**
 * `1d8+2` → `1W8+2`. Die Wurfanzahl muss Teil des Musters sein: zwischen Ziffer und `d` steht
 * keine Wortgrenze, ein `\bd`-Muster trifft nur das alleinstehende `d8`.
 */
export function formatDamageDice(dice: string): string {
  return dice.replace(/\b(\d*)[dD](\d+)\b/g, (_, count, faces) => `${count}W${faces}`);
}

/**
 * Kurze Schadenszeile einer Waffe („1W8 Stich"), wie sie neben dem Inventareintrag steht.
 * `twoHanded` hängt den zweihändigen Würfel an — der NPC-Bogen zeigt ihn bewusst nicht.
 */
export function weaponDamageLine(
  item: { damage?: DamageRef; two_handed_damage?: DamageRef },
  twoHanded = false,
): string {
  if (!item.damage) return '';
  const typeKey = item.damage.damage_type.index;
  const typeLabel = (DAMAGE_TYPE_LABELS[typeKey] ?? item.damage.damage_type.name).replace('schaden', '');
  let out = `${formatDamageDice(item.damage.damage_dice)} ${typeLabel}`;
  if (twoHanded && item.two_handed_damage) out += ` / ${formatDamageDice(item.two_handed_damage.damage_dice)}`;
  return out;
}
