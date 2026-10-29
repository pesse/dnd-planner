/** Ein Gegenstand mit `resistanceChoice`, wie ihn eine Inventarzeile nach getroffener Wahl beschreibt. */
import type { Item } from '$lib/types';
import type { DamageType } from '$lib/schemas/vocabulary';
import { DAMAGE_TYPE_LABELS } from '$lib/itemLabels';

export function withChosenResistance(item: Item, resistance: DamageType | undefined): Item;
export function withChosenResistance(item: Item | null, resistance: DamageType | undefined): Item | null;
export function withChosenResistance(item: Item | null, resistance: DamageType | undefined): Item | null {
  const choice = item?.resistanceChoice;
  if (!item || !choice || !resistance) return item;
  return { ...item, desc_de: [choice.descDe.replaceAll('{damage}', DAMAGE_TYPE_LABELS[resistance])] };
}
