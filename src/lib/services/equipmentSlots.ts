/**
 * Welcher angelegte Gegenstand an welchem Platz sitzt. Prüfung und Darstellung — was wirkt,
 * entscheidet weiter `wornItems.ts`.
 */
import { SLOT_ROOM, type EquipmentSlot } from '../schemas/equipmentSlot';
import { matchItem, type ItemIndex, type ItemInfo } from '../itemLibrary';
import type { CharacterInventoryEntry } from '../schemas/characterSchema';
import { equippedLinesIn, type EquippedLine } from './wornItems';

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
const isAmmo = (item: ItemInfo): boolean => item.category === 'ammunition';
const isBolts = (item: ItemInfo): boolean => /\bbolts?\b/i.test(item.name);

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

/**
 * Position der Fassung auf der Figur in Prozent (x, y), `stack` stapelt mehrere Stücke senkrecht.
 * Die rechte Seite des Charakters liegt vom Betrachter aus links.
 */
export const FIGURE_SOCKETS: [slot: EquipmentSlot, x: number, y: number, stack?: boolean][] = [
  ['head', 50, 7], ['eyes', 70, 9], ['neck', 50, 24], ['shoulders', 26, 21], ['back', 80, 22, true],
  ['body', 50, 36], ['arms', 14, 40, true], ['ring', 88, 50, true], ['waist', 50, 50],
  ['hipRight', 32, 58, true], ['hipLeft', 68, 58, true], ['boot', 24, 88], ['feet', 50, 93],
];

export interface Placed extends EquippedLine {
  slot: EquipmentSlot;
  /** Munition im Köcher oder Bolzenkasten. */
  contents?: Placed[];
  /** Der Köcher, in dem diese Munition steckt. */
  holder?: Placed;
}

export interface SlotFill {
  slot: EquipmentSlot;
  items: Placed[];
}

/** Angelegtes plus Munition, die ungefragt in einen angelegten Köcher wandert. */
export function figureLinesIn(index: ItemIndex, inventory: CharacterInventoryEntry[]): EquippedLine[] {
  const stowed = inventory.flatMap((entry, line) => {
    const item = entry.equipped ? undefined : matchItem(index, { sourceKey: entry.sourceKey, name: entry.name });
    return item && isAmmo(item) ? [{ line, entry, item, effective: true }] : [];
  });
  return [...equippedLinesIn(index, inventory), ...stowed].sort((a, b) => a.line - b.line);
}

/**
 * Gewählte Plätze zuerst, dann der Rest in Inventar-Reihenfolge auf den ersten Platz mit Raum,
 * sonst den am wenigsten vollen. Munition steckt im Köcher, wo einer hängt — Bolzen bevorzugt im
 * Bolzenkasten —, sonst hängt angelegte Munition am Gürtel.
 */
export function placeEquipment(lines: readonly EquippedLine[]): Map<EquipmentSlot, SlotFill> {
  const fills = new Map<EquipmentSlot, SlotFill>();
  const used = (slot: EquipmentSlot) => fills.get(slot)?.items.length ?? 0;
  const put = (l: EquippedLine, slot: EquipmentSlot) => {
    let f = fills.get(slot);
    if (!f) fills.set(slot, (f = { slot, items: [] }));
    f.items.push({ ...l, slot });
  };
  const roomiest = (options: EquipmentSlot[]) =>
    options.find((s) => used(s) < SLOT_ROOM[s])
      ?? options.reduce((a, b) => (used(b) / SLOT_ROOM[b] < used(a) / SLOT_ROOM[a] ? b : a));

  const ammo = lines.filter((l) => isAmmo(l.item));
  const rest = lines.filter((l) => !isAmmo(l.item));
  const chosen = (l: EquippedLine) => !!l.entry.slot && slotsFor(l.item).includes(l.entry.slot);
  for (const l of rest.filter(chosen)) put(l, l.entry.slot!);
  for (const l of rest.filter((l) => !chosen(l))) put(l, roomiest(slotsFor(l.item)));

  const holders = [...fills.values()].flatMap((f) => f.items).filter((p) => isAmmoHolder(p.item));
  for (const l of ammo) {
    const holder = holders.find((h) => isBolts(l.item) === /\bcase\b/i.test(h.item.name)) ?? holders[0];
    if (holder) (holder.contents ??= []).push({ ...l, slot: holder.slot, holder });
    else if (l.entry.equipped) put(l, chosen(l) ? l.entry.slot! : roomiest(['hipRight', 'hipLeft']));
  }
  return fills;
}
