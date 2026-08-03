/**
 * Lese-Index der Gegenstands-Bibliothek (ein Ordner je Kategorie) plus Auflösung
 * eines Charakter-/NPC-Eintrags auf einen Bibliothekseintrag.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Item } from './types';
import { OWN_SOURCE } from './schemas/source';
import { WEAPON_MASTERIES, type WeaponMastery } from './schemas/vocabulary';
import type { EquipmentChoiceCategory } from './schemas/wizardEquipment';
import { itemKeyOf } from './schemas/item';
import { API_CATEGORY_MAP, DIR_TO_CATEGORY } from './itemLabels';
import { scanJsonFolder } from './services/library/createLibrary';
import { buildNameIndex, matchByRef, type NameIndex } from './services/library/nameIndex';

export const ITEMS_PATH = './vault/items';

export interface ItemInfo {
  name: string;
  name_de?: string;
  category: string;
  rarity: string;
  weight?: number;
  path: string;
  /** Ziel von `inventory[].sourceKey`. */
  key?: string;
  /** Basis-Slug der Waffenart: „shortbow" trägt auch der Eidbogen (Kurzbogen). */
  index?: string;
  magic: boolean;
  // Der Index liest die Datei ohnehin ganz; diese drei Facetten mitzunehmen erspart
  // Waffenbeherrschung und Angriffstabelle ein zweites Laden jeder Waffendatei.
  weapon_category?: string; // Simple | Martial
  weapon_range?: string; // Melee | Ranged
  mastery?: WeaponMastery;
}

export function displayName(item: ItemInfo): string {
  return item.name_de ?? item.name;
}

const MAGIC_CATEGORIES = ['ring', 'rod', 'staff', 'wand', 'scroll', 'potion', 'wondrous-item', 'spellcasting-focus'];

/** Magie-Kategorien (Ring, Trank …) liefern `magic`. */
export function categoryToCoarseType(catKey: string): 'weapon' | 'armor' | 'magic' | 'gear' {
  if (catKey === 'weapon' || catKey === 'ammunition') return 'weapon';
  if (catKey === 'armor' || catKey === 'shield') return 'armor';
  if (MAGIC_CATEGORIES.includes(catKey)) return 'magic';
  return 'gear';
}

/** Einzig aus `equipment_category` — nichts anderes entscheidet den Ordner. */
export function dirOf(item: Item): string {
  const idx = item.equipment_category?.index;
  return idx ? (API_CATEGORY_MAP[idx] ?? 'other') : 'other';
}

/**
 * Rein aus `equipment_category`, damit Anzeige, Ordner und Dropdown übereinstimmen. Reine
 * Magie-Kategorien haben keine Waffen-/Rüstungswerte und laufen wie „gear".
 */
export function structuralType(item: Item): 'weapon' | 'armor' | 'gear' {
  const t = categoryToCoarseType(dirOf(item));
  return t === 'magic' ? 'gear' : t;
}

export function isMagicItem(item: Item): boolean {
  return categoryToCoarseType(dirOf(item)) === 'magic'
    || !!item.rarity || !!item.attunement || item.magic_bonus != null;
}

export function blankItem(name: string, dir: string): Item {
  const apiName = dir.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return {
    key: '',
    name,
    name_de: name,
    equipment_category: { index: dir, name: apiName },
    desc: [],
    desc_de: [],
    source: OWN_SOURCE,
    document: { key: OWN_SOURCE, gamesystem: '' },
  };
}

export function toHomebrewCopy(item: Item): Item {
  // `key`/`index` leeren: die Kopie braucht eine EIGENE Identität, der Key wird beim
  // Laden aus source+name backfilled.
  return { ...item, source: OWN_SOURCE, key: '', index: undefined, document: { key: OWN_SOURCE, gamesystem: '' } };
}

let cache: Record<string, ItemInfo[]> = {};
let knownDirs: string[] = [];

export async function listItemDirs(): Promise<string[]> {
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: ITEMS_PATH });
    knownDirs = entries.filter((e) => e.is_dir).map((e) => e.name).sort();
  } catch {
    knownDirs = [];
  }
  return knownDirs;
}

/** Für Aufrufer ohne `await` (leerer Draft). */
export function loadedItemDirs(): string[] {
  return knownDirs;
}

export function invalidateItemCache(dir?: string) {
  if (dir) {
    delete cache[dir];
  } else {
    cache = {};
  }
}

/**
 * Aus den Dateien NICHT ableitbar: `items/tools/` mischt Handwerkszeug, Instrumente, Spielsets
 * und Sonderwerkzeuge, und die „Craft:"-Zeile trifft auch Ausrüstung, die im SRD kein
 * Handwerkszeug ist. Englische Keys, Anzeige aus `name_de` — keine zweite Übersetzungstabelle.
 */
export const ARTISAN_TOOL_INDEXES = [
  'alchemists-supplies', 'brewers-supplies', 'calligraphers-supplies', 'carpenters-tools',
  'cartographers-tools', 'cobblers-tools', 'cooks-utensils', 'glassblowers-tools',
  'jewelers-tools', 'leatherworkers-tools', 'masons-tools', 'painters-supplies',
  'potters-tools', 'smiths-tools', 'tinkers-tools', 'weavers-tools', 'woodcarvers-tools',
] as const;

/**
 * Für die Stellen, an denen die Regel keine Wahl trifft („Handwerkszeug deiner Wahl").
 * Instrumente hängen am `index`-Präfix, Handwerkszeuge an `ARTISAN_TOOL_INDEXES`.
 */
export async function getToolChoices(category: EquipmentChoiceCategory): Promise<ItemInfo[]> {
  const tools = await getItemsByDir('tools').catch(() => []);
  const match = (i: ItemInfo) =>
    category === 'instrument'
      ? (i.index ?? '').startsWith('musical-instrument-')
      : (ARTISAN_TOOL_INDEXES as readonly string[]).includes(i.index ?? '');
  return tools.filter(match).sort((a, b) => displayName(a).localeCompare(displayName(b), 'de'));
}

export async function getItemsByDir(dir: string): Promise<ItemInfo[]> {
  if (cache[dir]) return cache[dir];
  try {
    const items = await scanJsonFolder<ItemInfo>(
      `${ITEMS_PATH}/${dir}`,
      (data, { path, filename }) => ({
        name: data.name ?? filename.replace('.json', ''),
        name_de: data.name_de,
        category: data.category ?? DIR_TO_CATEGORY[dir] ?? 'other',
        rarity: data.rarity ?? '—',
        weight: typeof data.weight === 'number' ? data.weight : undefined,
        path,
        // Nicht `data.key`: Homebrew ohne Key wäre sonst nicht verlinkbar.
        key: itemKeyOf(data) || undefined,
        index: data.index,
        magic: isMagicItem(data as Item),
        weapon_category: data.weapon_category,
        weapon_range: data.weapon_range,
        // Nur geschlossenes Vokabular: eine falsch gepflegte Datei liefert `undefined`
        // statt einen Fremdwert weiterzutragen.
        mastery: (WEAPON_MASTERIES as readonly string[]).includes(data.mastery) ? data.mastery : undefined,
      }),
      ({ path, filename }) => ({
        name: filename.replace('.json', ''),
        category: DIR_TO_CATEGORY[dir] ?? 'other',
        rarity: '—',
        magic: false,
        path,
      }),
    );
    items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    cache[dir] = items;
  } catch {
    cache[dir] = [];
  }
  return cache[dir];
}

export type ItemIndex = NameIndex<ItemInfo>;

export function buildItemIndex(loadedByDir: Record<string, ItemInfo[]>): ItemIndex {
  return buildNameIndex(Object.values(loadedByDir).flat(), {
    key: (i) => i.key,
    names: (i) => [i.name_de, i.name],
    identity: (i) => i.path,
  });
}

export const matchItem = matchByRef<ItemInfo>;

/**
 * Der Anzeigename, wenn der Text eine WAFFE der Bibliothek nennt — sonst `undefined`: dann ist
 * er Prosa („Kriegswaffen mit Finesse") und wirkt nicht. Die EINE Grenze zwischen
 * `individualWeapons` und dem Freitext daneben; Mehrdeutige bleiben liegen wie beim Inventar.
 */
export function matchWeaponName(index: ItemIndex, text: string): string | undefined {
  const name = text.trim().toLowerCase();
  if (!name || index.ambiguous.has(name)) return undefined;
  const hit = index.byName.get(name);
  return hit?.key && hit.category === 'weapon' ? displayName(hit) : undefined;
}

export interface ItemSuggestion {
  item: ItemInfo;
  dir: string;
  filename: string;
}

export function searchItems(
  loadedByDir: Record<string, ItemInfo[]>,
  query: string,
  maxResults = 10,
): ItemSuggestion[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();

  const results: ItemSuggestion[] = [];
  for (const [dir, items] of Object.entries(loadedByDir)) {
    for (const item of items) {
      if (!displayName(item).toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) continue;
      results.push({ item, dir, filename: item.path.split('/').pop() ?? '' });
    }
  }

  results.sort((a, b) => {
    const an = displayName(a.item).toLowerCase();
    const bn = displayName(b.item).toLowerCase();
    if (an.startsWith(q) !== bn.startsWith(q)) return an.startsWith(q) ? -1 : 1;
    return an.localeCompare(bn, 'de');
  });

  return results.slice(0, maxResults);
}
