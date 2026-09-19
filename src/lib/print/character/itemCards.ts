/**
 * Die Gegenstandskarten des Bogens: die im Inventar angehakten Zeilen (`printCard`), aufgelöst
 * über die Bibliothek. Wie die Zauberkarten messen sie im DOM und entstehen erst auf Anforderung.
 */
import type { Character } from '$lib/schemas/characterSchema';
import { buildItemIndex, getAllItemsByDir, matchItem, type ItemInfo } from '$lib/itemLibrary';
import { invoke } from '@tauri-apps/api/core';
import type { Item } from '$lib/types';
import { itemCardPages } from '$lib/utils/printItemCard';

/** Der Klassenname, unter dem `css/cards.ts` das 3×3-Raster setzt. */
const CARDS_PAGE_CLASS = 'cards';

/** Die angehakten Zeilen mit Bibliothekseintrag, in Inventar-Reihenfolge und jede Karte einmal. */
export async function cardItemInfos(c: Character): Promise<ItemInfo[]> {
  const marked = (c.inventory ?? []).filter((line) => line.printCard);
  if (!marked.length) return [];

  const index = buildItemIndex(await getAllItemsByDir());
  const out: ItemInfo[] = [];
  const seen = new Set<string>();
  for (const line of marked) {
    const hit = matchItem(index, line);
    if (!hit || seen.has(hit.path)) continue;
    seen.add(hit.path);
    out.push(hit);
  }
  return out;
}

async function loadItem(path: string): Promise<Item | null> {
  try {
    return JSON.parse(await invoke<string>('read_file_content', { path })) as Item;
  } catch {
    return null;
  }
}

export async function loadItemCardPages(infos: ItemInfo[], doc: Document): Promise<string> {
  const items: Item[] = [];
  for (const info of infos) {
    const item = await loadItem(info.path);
    if (item) items.push(item);
  }
  return items.length ? itemCardPages(items, doc, CARDS_PAGE_CLASS) : '';
}
