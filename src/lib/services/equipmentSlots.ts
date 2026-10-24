/**
 * Welcher angelegte Gegenstand an welchem Platz sitzt. Prüfung und Darstellung — was wirkt,
 * entscheidet weiter `wornItems.ts`.
 */
import { SINGLE_WEAR, SLOT_ROOM, type EquipmentSlot } from '../schemas/equipmentSlot';
import type { ItemInfo } from '../itemLibrary';
import type { EquippedLine } from './wornItems';

const BODY_ARMOR = ['Light', 'Medium', 'Heavy'];
const CARRIED = ['weapon', 'rod', 'wand', 'spellcasting-focus'];
const SLUNG: EquipmentSlot[] = ['back', 'hipRight', 'hipLeft'];
const AT_BELT: EquipmentSlot[] = ['hipRight', 'hipLeft', 'back'];

// Wundersames und Ausrüstung haben keine Kategorie, die den Platz verrät; der englische SRD-Name
// schon. Ein deklariertes `slot` am Gegenstand geht vor.
const NAME_SLOTS: [RegExp, EquipmentSlot[]][] = [
  [/\b(quiver|bolt case|case, crossbow bolt)\b/i, SLUNG],
  [/\b(pouch|bandolier|flask|waterskin)\b/i, ['hipLeft', 'hipRight']],
  [/\b(backpack|bedroll|bag of holding|haversack)\b/i, ['back']],
  [/\b(helm|hat|circlet|headband|crown|cap)\b/i, ['head']],
  [/\b(goggles|eyes of|lenses|spectacles)\b/i, ['eyes']],
  [/\b(amulet|necklace|periapt|medallion|brooch|scarab)\b/i, ['neck']],
  [/\b(cloak|cape|mantle|robe)\b/i, ['shoulders']],
  [/\b(gloves|gauntlets|bracers)\b/i, ['arms']],
  [/\b(belt|girdle)\b/i, ['waist']],
  [/\b(boots|slippers|sandals)\b/i, ['feet']],
];

const isShield = (item: ItemInfo): boolean => item.armor_category === 'Shield' || item.category === 'shield';
const isTwoHanded = (item: ItemInfo): boolean => (item.properties ?? []).some((p) => p.index === 'two-handed');
const LONG = ['quarterstaff', 'spear', 'javelin', 'trident', 'pike', 'lance'];
const isLong = (item: ItemInfo): boolean =>
  LONG.includes(item.index ?? '') || (item.properties ?? []).some((p) => p.index === 'reach');
const isDagger = (item: ItemInfo): boolean => item.index === 'dagger' || /\bdagger\b/i.test(item.name);
const isAmmoHolder = (item: ItemInfo): boolean => NAME_SLOTS[0][0].test(item.name);

/** Wohin der Gegenstand passt, das Naheliegende zuerst; mehr als ein Eintrag heißt: der Spieler wählt. */
export function slotsFor(item: ItemInfo): EquipmentSlot[] {
  if (item.slot) return [item.slot];
  if (isShield(item) || item.category === 'staff' || (CARRIED.includes(item.category) && isTwoHanded(item))) return ['back'];
  if (CARRIED.includes(item.category) && isLong(item)) return SLUNG;
  if (CARRIED.includes(item.category)) return isDagger(item) ? ['hipRight', 'hipLeft', 'boot', 'back'] : AT_BELT;
  if (item.category === 'ammunition') return SLUNG;
  if (BODY_ARMOR.includes(item.armor_category ?? '') || item.category === 'armor') return ['body'];
  if (item.category === 'ring') return ['ring'];
  return NAME_SLOTS.find(([re]) => re.test(item.name))?.[1] ?? ['other'];
}

export interface Placed extends EquippedLine {
  slot: EquipmentSlot;
  /** Liegt an einem Platz, von dem man nur ein Stück trägt, und ist nicht das erste. */
  spare: boolean;
}

export interface SlotFill {
  slot: EquipmentSlot;
  items: Placed[];
}

/**
 * Gewählte Plätze zuerst, dann der Rest in Inventar-Reihenfolge auf den ersten Platz mit Raum,
 * sonst den am wenigsten vollen. Munition landet beim Köcher, wo einer hängt.
 */
export function placeEquipment(lines: readonly EquippedLine[]): Map<EquipmentSlot, SlotFill> {
  const fills = new Map<EquipmentSlot, SlotFill>();
  const used = (slot: EquipmentSlot) => fills.get(slot)?.items.length ?? 0;
  const put = (l: EquippedLine, slot: EquipmentSlot) => {
    let f = fills.get(slot);
    if (!f) fills.set(slot, (f = { slot, items: [] }));
    f.items.push({ ...l, slot, spare: SINGLE_WEAR.has(slot) && f.items.length > 0 });
  };
  const roomiest = (options: EquipmentSlot[]) =>
    options.find((s) => used(s) < SLOT_ROOM[s])
      ?? options.reduce((a, b) => (used(b) / SLOT_ROOM[b] < used(a) / SLOT_ROOM[a] ? b : a));

  const chosen = (l: EquippedLine) => !!l.entry.slot && slotsFor(l.item).includes(l.entry.slot);
  const ammo = (l: EquippedLine) => !chosen(l) && l.item.category === 'ammunition';
  for (const l of lines.filter(chosen)) put(l, l.entry.slot!);
  for (const l of lines.filter((l) => !chosen(l) && !ammo(l))) put(l, roomiest(slotsFor(l.item)));
  const holder = [...fills.values()].flatMap((f) => f.items).find((p) => isAmmoHolder(p.item));
  for (const l of lines.filter(ammo)) put(l, holder?.slot ?? roomiest(['hipRight', 'hipLeft']));
  return fills;
}
