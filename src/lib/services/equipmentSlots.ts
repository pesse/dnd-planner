/**
 * Welcher angelegte Gegenstand an welchem Platz sitzt und wo mehr liegt, als hineinpasst.
 * Prüfung und Darstellung — was wirkt, entscheidet weiter `wornItems.ts`.
 */
import { SLOT_CAPACITY, type EquipmentSlot } from '../schemas/equipmentSlot';
import type { ItemInfo } from '../itemLibrary';
import type { WornItem } from './wornItems';

const BODY_ARMOR = ['Light', 'Medium', 'Heavy'];

// Wundersames hat keine Kategorie, die den Platz verrät; der englische SRD-Name schon.
// Ein deklariertes `slot` am Gegenstand geht vor.
const NAME_SLOTS: [RegExp, EquipmentSlot][] = [
  [/\b(helm|hat|circlet|headband|crown|cap)\b/i, 'head'],
  [/\b(goggles|eyes of|lenses|spectacles)\b/i, 'eyes'],
  [/\b(amulet|necklace|periapt|medallion|brooch|scarab)\b/i, 'neck'],
  [/\b(cloak|cape|mantle|robe)\b/i, 'shoulders'],
  [/\b(gloves|gauntlets|bracers)\b/i, 'arms'],
  [/\b(belt|girdle)\b/i, 'waist'],
  [/\b(boots|slippers|sandals)\b/i, 'feet'],
];

export function slotOf(item: ItemInfo): EquipmentSlot {
  if (item.slot) return item.slot;
  if (item.armor_category === 'Shield' || item.category === 'shield') return 'hands';
  if (BODY_ARMOR.includes(item.armor_category ?? '') || item.category === 'armor') return 'body';
  if (item.category === 'ring') return 'ring';
  if (['weapon', 'staff', 'rod', 'wand', 'spellcasting-focus'].includes(item.category)) return 'hands';
  return NAME_SLOTS.find(([re]) => re.test(item.name))?.[1] ?? 'other';
}

const isTwoHanded = (item: ItemInfo): boolean =>
  (item.properties ?? []).some((p) => p.index === 'two-handed');

/** Wie viel vom Platz der Gegenstand belegt. */
export const slotLoad = (item: ItemInfo): number => (slotOf(item) === 'hands' && isTwoHanded(item) ? 2 : 1);

export interface SlotFill<T extends WornItem = WornItem> {
  slot: EquipmentSlot;
  items: T[];
  used: number;
  capacity: number;
  overfull: boolean;
}

export function fillSlots<T extends WornItem>(equipped: readonly T[]): Map<EquipmentSlot, SlotFill<T>> {
  const fills = new Map<EquipmentSlot, SlotFill<T>>();
  for (const e of equipped) {
    const slot = slotOf(e.item);
    const fill = fills.get(slot) ?? { slot, items: [], used: 0, capacity: SLOT_CAPACITY[slot], overfull: false };
    fill.items.push(e);
    fill.used += slotLoad(e.item);
    fill.overfull = fill.used > fill.capacity;
    fills.set(slot, fill);
  }
  return fills;
}
