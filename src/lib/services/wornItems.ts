/**
 * Welche Inventarzeilen gerade wirken: angelegt und — wo der Gegenstand es verlangt — eingestimmt.
 * Die eine Regel für jede Gegenstands-Mechanik (Vorräte, Attributswerte, …).
 */
import type { CharacterInventoryEntry } from '$lib/schemas/characterSchema';
import type { FeatureGrant } from '$lib/schemas/grants';
import { buildItemIndex, getAllItemsByDir, matchItem, type ItemIndex, type ItemInfo } from '$lib/itemLibrary';

export interface WornItem {
  /** `item.key`, ersatzweise der Inventarname. */
  id: string;
  item: ItemInfo;
}

export interface IdleItem {
  item: ItemInfo;
  reason: 'unequipped' | 'unattuned';
}

/** Die eine Regel: wirkt eine angelegte Zeile, oder warum nicht. */
function lineState(entry: CharacterInventoryEntry, item: ItemInfo): 'worn' | IdleItem['reason'] {
  if (!entry.equipped) return 'unequipped';
  return item.attunement && !entry.attuned ? 'unattuned' : 'worn';
}

function sortInventory(index: ItemIndex, inventory: CharacterInventoryEntry[]): { worn: WornItem[]; idle: IdleItem[] } {
  const worn: WornItem[] = [];
  const idle: IdleItem[] = [];
  const seen = new Set<string>();
  for (const entry of inventory) {
    const item = matchItem(index, { sourceKey: entry.sourceKey, name: entry.name });
    if (!item) continue;
    const state = lineState(entry, item);
    if (state !== 'worn') idle.push({ item, reason: state });
    else {
      // Zwei Zeilen desselben Gegenstands sind Buchhaltung des Inventars, keine zweite Wirkung —
      // sonst zählte `count: 2` anders als zwei Zeilen.
      const id = item.key ?? entry.name;
      if (seen.has(id)) continue;
      seen.add(id);
      worn.push({ id, item });
    }
  }
  return { worn, idle };
}

export const wornItemsIn = (index: ItemIndex, inventory: CharacterInventoryEntry[]): WornItem[] =>
  sortInventory(index, inventory).worn;

/** Was im Inventar liegt, aber nicht wirkt — damit eine Herleitung sagen kann, warum. */
export const idleItemsIn = (index: ItemIndex, inventory: CharacterInventoryEntry[]): IdleItem[] =>
  sortInventory(index, inventory).idle;

export interface EquippedLine {
  /** Zeile im Inventar — jede angelegte Zeile ist ein Stück an der Figur, auch doppelte. */
  line: number;
  entry: CharacterInventoryEntry;
  item: ItemInfo;
  /** false = angelegt, aber mangels Einstimmung wirkungslos. */
  effective: boolean;
}

export function equippedLinesIn(index: ItemIndex, inventory: CharacterInventoryEntry[]): EquippedLine[] {
  return inventory.flatMap((entry, line) => {
    const item = entry.equipped ? matchItem(index, { sourceKey: entry.sourceKey, name: entry.name }) : undefined;
    return item ? [{ line, entry, item, effective: lineState(entry, item) === 'worn' }] : [];
  });
}

export interface AttunementLimit {
  max: number;
  /** Merkmal, das die Grenze über drei hebt. */
  labelDe?: string;
}

export function attunementLimit(features: readonly { name: string; grants?: FeatureGrant }[]): AttunementLimit {
  let best: AttunementLimit = { max: 3 };
  for (const f of features) {
    const max = f.grants?.attunementLimit;
    if (max !== undefined && max > best.max) best = { max, labelDe: f.name };
  }
  return best;
}

export const attunedCount = (inventory: readonly CharacterInventoryEntry[]): number =>
  inventory.filter((e) => e.attuned).length;

export async function wornItems(inventory: CharacterInventoryEntry[]): Promise<WornItem[]> {
  if (!inventory.some((e) => e.equipped)) return [];
  return wornItemsIn(buildItemIndex(await getAllItemsByDir()), inventory);
}
