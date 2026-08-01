/**
 * Lese-Index der Gegenstands-Bibliothek (`vault/items`, ein Ordner je Kategorie)
 * plus Auflösung eines Charakter-/NPC-Eintrags auf einen Bibliothekseintrag.
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
  /** Identität des Bibliothekseintrags („{source}_{slug}"). Ziel von `inventory[].sourceKey`. */
  key?: string;
  /** Basis-Slug der Waffenart: „shortbow" trägt auch der Eidbogen (Kurzbogen). */
  index?: string;
  magic: boolean;
  // Der Index liest die Datei ohnehin vollständig; diese drei Waffen-Facetten mitzunehmen
  // erspart der Waffenbeherrschung (services/weaponMastery.ts) und der
  // Angriffstabelle im Bogen, jede Waffendatei ein zweites Mal zu laden.
  weapon_category?: string; // Simple | Martial
  weapon_range?: string; // Melee | Ranged
  mastery?: WeaponMastery;
}

/** Zeigt den deutschen Namen, falls vorhanden, sonst den Originalnamen. */
export function displayName(item: ItemInfo): string {
  return item.name_de ?? item.name;
}

const MAGIC_CATEGORIES = ['ring', 'rod', 'staff', 'wand', 'scroll', 'potion', 'wondrous-item', 'spellcasting-focus'];

/** Grobe „Schublade" einer Kategorie. Magie-Kategorien (Ring, Trank …) liefern hier `magic`. */
export function categoryToCoarseType(catKey: string): 'weapon' | 'armor' | 'magic' | 'gear' {
  if (catKey === 'weapon' || catKey === 'ammunition') return 'weapon';
  if (catKey === 'armor' || catKey === 'shield') return 'armor';
  if (MAGIC_CATEGORIES.includes(catKey)) return 'magic';
  return 'gear';
}

/** Leitet den Zielordner (Kategorie) aus einem Item ab — einzig aus `equipment_category`. */
export function dirOf(item: Item): string {
  const idx = item.equipment_category?.index;
  return idx ? (API_CATEGORY_MAP[idx] ?? 'other') : 'other';
}

/**
 * Struktureller Typ (steuert, welcher Statwerte-Block angezeigt wird): rein aus
 * `equipment_category` abgeleitet, damit Anzeige, Ordner und Dropdown immer übereinstimmen.
 * Reine Magie-Kategorien (Ring, Trank …) haben keine Waffen-/Rüstungswerte → wie „gear".
 */
export function structuralType(item: Item): 'weapon' | 'armor' | 'gear' {
  const t = categoryToCoarseType(dirOf(item));
  return t === 'magic' ? 'gear' : t;
}

/** Hat das Item magische Facetten (Magie-Kategorie oder Seltenheit/Einstimmung/Bonus)? */
export function isMagicItem(item: Item): boolean {
  return categoryToCoarseType(dirOf(item)) === 'magic'
    || !!item.rarity || !!item.attunement || item.magic_bonus != null;
}

/** Leeres Item für die gewählte Kategorie (equipment_category passend gesetzt). */
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

/** Vorlage → anpassbare Homebrew-Kopie (ohne Verknüpfung zur Quelle). */
export function toHomebrewCopy(item: Item): Item {
  // `key`/`index` leeren, damit die Kopie eine EIGENE Identität bekommt (der neue
  // `key` wird beim Laden aus source+name backfilled); Herkunft auf Eigen setzen.
  return { ...item, source: OWN_SOURCE, key: '', index: undefined, document: { key: OWN_SOURCE, gamesystem: '' } };
}

let cache: Record<string, ItemInfo[]> = {};
let knownDirs: string[] = [];

/** Kategorie-Ordner der Bibliothek, alphabetisch. */
export async function listItemDirs(): Promise<string[]> {
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: ITEMS_PATH });
    knownDirs = entries.filter((e) => e.is_dir).map((e) => e.name).sort();
  } catch {
    knownDirs = [];
  }
  return knownDirs;
}

/** Zuletzt gelesene Kategorie-Ordner — für Aufrufer ohne await (leerer Draft). */
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
 * Die 17 Handwerkszeuge des SRD 5.2 als Open5e-`index`. „Handwerkszeug" ist eine
 * Kategorie über ihnen, kein Gegenstand — und aus den Dateien NICHT ableitbar:
 * `items/tools/` mischt Handwerkszeug, Musikinstrumente, Spielsets und
 * Sonderwerkzeuge, und die „Craft:"-Zeile trifft auch Verkleidungs-,
 * Kräuterkunde- und Giftmischerausrüstung (die im SRD keine Handwerkszeuge sind).
 * Nur englische Keys, wie die anderen geschlossenen Vokabulare — die Anzeige kommt
 * aus `name_de` der Bibliothek, keine zweite Übersetzungstabelle.
 */
export const ARTISAN_TOOL_INDEXES = [
  'alchemists-supplies', 'brewers-supplies', 'calligraphers-supplies', 'carpenters-tools',
  'cartographers-tools', 'cobblers-tools', 'cooks-utensils', 'glassblowers-tools',
  'jewelers-tools', 'leatherworkers-tools', 'masons-tools', 'painters-supplies',
  'potters-tools', 'smiths-tools', 'tinkers-tools', 'weavers-tools', 'woodcarvers-tools',
] as const;

/**
 * Wählbare Gegenstände einer Werkzeug-KATEGORIE, alphabetisch — für die Stellen,
 * an denen die Regel keine Wahl trifft (Mönch: „Handwerkszeug", Barde:
 * „Musikinstrument deiner Wahl"). Musikinstrumente hängen am `index`-Präfix, die
 * Handwerkszeuge an `ARTISAN_TOOL_INDEXES`.
 */
export async function getToolChoices(category: EquipmentChoiceCategory): Promise<ItemInfo[]> {
  const tools = await getItemsByDir('tools').catch(() => []);
  const match = (i: ItemInfo) =>
    category === 'instrument'
      ? (i.index ?? '').startsWith('musical-instrument-')
      : (ARTISAN_TOOL_INDEXES as readonly string[]).includes(i.index ?? '');
  return tools.filter(match).sort((a, b) => displayName(a).localeCompare(displayName(b), 'de'));
}

/** Lädt alle Items einer Kategorie (mit Cache). */
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
        // Nur ein Wert aus dem geschlossenen Vokabular kommt durch — eine falsch
        // gepflegte Datei liefert `undefined` statt einen Fremdwert weiterzutragen.
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

export interface ItemSuggestion {
  item: ItemInfo;
  dir: string;
  filename: string;
}

/** Sucht über alle geladenen Kategorien nach Name. */
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
