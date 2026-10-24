/**
 * Welcher angelegte Gegenstand an welchem Platz sitzt und wo mehr liegt, als hineinpasst.
 * Prüfung und Darstellung — was wirkt, entscheidet weiter `wornItems.ts`.
 */
import { SLOT_CAPACITY, type EquipmentSlot } from '../schemas/equipmentSlot';
import type { ItemInfo } from '../itemLibrary';
import type { EquippedLine } from './wornItems';

const BODY_ARMOR = ['Light', 'Medium', 'Heavy'];
const CARRIED = ['weapon', 'rod', 'wand', 'spellcasting-focus'];

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

const isShield = (item: ItemInfo): boolean => item.armor_category === 'Shield' || item.category === 'shield';
const isTwoHanded = (item: ItemInfo): boolean => (item.properties ?? []).some((p) => p.index === 'two-handed');
const isDagger = (item: ItemInfo): boolean => item.index === 'dagger' || /\bdagger\b/i.test(item.name);

/** Wohin der Gegenstand passt, das Naheliegende zuerst; mehr als ein Eintrag heißt: der Spieler wählt. */
export function slotsFor(item: ItemInfo): EquipmentSlot[] {
  if (item.slot) return [item.slot];
  if (isShield(item) || item.category === 'staff' || (CARRIED.includes(item.category) && isTwoHanded(item))) return ['back'];
  if (CARRIED.includes(item.category)) return ['hipRight', 'hipLeft', ...(isDagger(item) ? ['boot' as const] : []), 'back'];
  if (BODY_ARMOR.includes(item.armor_category ?? '') || item.category === 'armor') return ['body'];
  if (item.category === 'ring') return ['ring'];
  return [NAME_SLOTS.find(([re]) => re.test(item.name))?.[1] ?? 'other'];
}

export interface Placed extends EquippedLine {
  slot: EquipmentSlot;
}

export interface SlotFill {
  slot: EquipmentSlot;
  items: Placed[];
  used: number;
  capacity: number;
  overfull: boolean;
}

/** Gewählte Plätze zuerst, dann der Rest in Inventar-Reihenfolge auf den ersten freien passenden Platz. */
export function placeEquipment(lines: readonly EquippedLine[]): Map<EquipmentSlot, SlotFill> {
  const fills = new Map<EquipmentSlot, SlotFill>();
  const fill = (slot: EquipmentSlot): SlotFill => {
    let f = fills.get(slot);
    if (!f) fills.set(slot, (f = { slot, items: [], used: 0, capacity: SLOT_CAPACITY[slot], overfull: false }));
    return f;
  };
  const free = (slot: EquipmentSlot): boolean => (fills.get(slot)?.used ?? 0) < SLOT_CAPACITY[slot];
  const put = (l: EquippedLine, slot: EquipmentSlot) => {
    const f = fill(slot);
    f.items.push({ ...l, slot });
    f.used++;
  };

  const chosen = lines.filter((l) => l.entry.slot && slotsFor(l.item).includes(l.entry.slot));
  for (const l of chosen) put(l, l.entry.slot!);
  for (const l of lines.filter((l) => !chosen.includes(l))) {
    const options = slotsFor(l.item);
    put(l, options.find(free) ?? options[0]);
  }
  for (const f of fills.values()) f.overfull = f.used > f.capacity;
  return fills;
}
