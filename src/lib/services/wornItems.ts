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

export function wornItemsIn(index: ItemIndex, inventory: CharacterInventoryEntry[]): WornItem[] {
  const out: WornItem[] = [];
  const seen = new Set<string>();
  for (const entry of inventory) {
    if (!entry.equipped) continue;
    const item = matchItem(index, { sourceKey: entry.sourceKey, name: entry.name });
    if (!item) continue;
    if (item.attunement && !entry.attuned) continue;
    // Zwei Zeilen desselben Gegenstands sind Buchhaltung des Inventars, keine zweite Wirkung —
    // sonst zählte `count: 2` anders als zwei Zeilen.
    const id = item.key ?? entry.name;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, item });
  }
  return out;
}

export async function wornItems(inventory: CharacterInventoryEntry[]): Promise<WornItem[]> {
  if (!inventory.some((e) => e.equipped)) return [];
  return wornItemsIn(buildItemIndex(await getAllItemsByDir()), inventory);
}
