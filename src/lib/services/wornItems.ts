/**
 * Welche Inventarzeilen gerade wirken: angelegt und — wo der Gegenstand es verlangt — eingestimmt.
 * Die eine Regel für jede Gegenstands-Mechanik (Vorräte, Attributswerte, …).
 */
import type { CharacterInventoryEntry } from '$lib/schemas/characterSchema';
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

function sortInventory(index: ItemIndex, inventory: CharacterInventoryEntry[]): { worn: WornItem[]; idle: IdleItem[] } {
  const worn: WornItem[] = [];
  const idle: IdleItem[] = [];
  const seen = new Set<string>();
  for (const entry of inventory) {
    const item = matchItem(index, { sourceKey: entry.sourceKey, name: entry.name });
    if (!item) continue;
    if (!entry.equipped) idle.push({ item, reason: 'unequipped' });
    else if (item.attunement && !entry.attuned) idle.push({ item, reason: 'unattuned' });
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

export async function wornItems(inventory: CharacterInventoryEntry[]): Promise<WornItem[]> {
  if (!inventory.some((e) => e.equipped)) return [];
  return wornItemsIn(buildItemIndex(await getAllItemsByDir()), inventory);
}
