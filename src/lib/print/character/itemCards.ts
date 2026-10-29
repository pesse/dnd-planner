/**
 * Die Gegenstandskarten des Bogens: die im Inventar angehakten Zeilen (`printCard`), aufgelöst
 * über die Bibliothek. Wie die Zauberkarten messen sie im DOM und entstehen erst auf Anforderung.
 */
import type { Character } from '$lib/schemas/characterSchema';
import { buildItemIndex, getAllItemsByDir, matchItem, type ItemInfo } from '$lib/itemLibrary';
import type { DamageType } from '$lib/schemas/vocabulary';
import { withChosenResistance } from '$lib/utils/chosenResistance';
import { invoke } from '@tauri-apps/api/core';
import type { Item } from '$lib/types';
import { itemCardPages } from '$lib/utils/printItemCard';
import { CARDS_PAGE_CLASS } from './css/cards';

export interface CardItem {
  info: ItemInfo;
  /** Die Wahl der Zeile ersetzt die Würfeltabelle der Beschreibung. */
  resistance?: DamageType;
}

/** Die angehakten Zeilen mit Bibliothekseintrag, in Inventar-Reihenfolge und jede Karte einmal. */
export async function cardItemInfos(c: Character): Promise<CardItem[]> {
  const marked = (c.inventory ?? []).filter((line) => line.printCard);
  if (!marked.length) return [];

  const index = buildItemIndex(await getAllItemsByDir());
  const out: CardItem[] = [];
  const seen = new Set<string>();
  for (const line of marked) {
    const hit = matchItem(index, line);
    const id = `${hit?.path}|${line.resistance ?? ''}`;
    if (!hit || seen.has(id)) continue;
    seen.add(id);
    out.push({ info: hit, resistance: line.resistance });
  }
  return out;
}

export async function loadItem(path: string): Promise<Item | null> {
  try {
    return JSON.parse(await invoke<string>('read_file_content', { path })) as Item;
  } catch {
    return null;
  }
}

export async function loadItemCardPages(cards: CardItem[], doc: Document): Promise<string> {
  const items: Item[] = [];
  for (const { info, resistance } of cards) {
    const item = await loadItem(info.path);
    if (item) items.push(withChosenResistance(item, resistance));
  }
  return items.length ? itemCardPages(items, doc, CARDS_PAGE_CLASS) : '';
}
