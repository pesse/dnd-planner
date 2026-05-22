/**
 * Lädt und cached den Item-Index aus vault/items.
 * Stellt Suchfunktionen bereit.
 */
import { invoke } from '@tauri-apps/api/core';

export const ITEMS_PATH = './vault/items';

export interface ItemInfo {
  name: string;
  name_de?: string;
  category: string;
  rarity: string;
  weight?: number;
  path: string;
}

/** Zeigt den deutschen Namen, falls vorhanden, sonst den Originalnamen. */
export function displayName(item: ItemInfo): string {
  return item.name_de ?? item.name;
}

/**
 * Kategorie-Schlüssel = Ordnername = DnD-API equipment_category.index.
 * Identity-Mapping: vault/items/{key}/ enthält Items dieser Kategorie.
 */

/** Farbe pro Kategorie (Catppuccin Mocha Palette) */
export const CATEGORY_COLORS: Record<string, string> = {
  'weapon':              '#f38ba8', // red
  'armor':               '#89b4fa', // blue
  'ammunition':          '#94e2d5', // teal
  'adventuring-gear':    '#f2cdcd', // flamingo
  'tools':               '#74c7ec', // sapphire
  'mounts-and-vehicles': '#b4befe', // lavender
  'wondrous-items':      '#cba6f7', // mauve
  'ring':                '#f9e2af', // yellow
  'rod':                 '#fab387', // peach
  'staff':               '#eba0ac', // maroon
  'wand':                '#f5c2e7', // pink
  'scroll':              '#89dceb', // sky
  'potion':              '#a6e3a1', // green
  'other':               '#585b70', // overlay
};

/** Ordnername → Kategorie-Schlüssel (identity). */
export const DIR_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.keys(CATEGORY_COLORS).map((k) => [k, k])
);

/** Kategorie-Schlüssel → Ordnername (identity). */
export const CATEGORY_TO_DIR: Record<string, string> = { ...DIR_TO_CATEGORY };

export const CATEGORY_LABELS: Record<string, string> = {
  'weapon':              'Waffe',
  'armor':               'Rüstung',
  'ammunition':          'Munition',
  'adventuring-gear':    'Ausrüstung',
  'tools':               'Werkzeug',
  'mounts-and-vehicles': 'Reittiere & Fahrzeuge',
  'wondrous-items':      'Wundersamer Gegenstand',
  'ring':                'Ring',
  'rod':                 'Rute',
  'staff':               'Stab',
  'wand':                'Zauberstab',
  'scroll':              'Schriftrolle',
  'potion':              'Trank',
  'other':               'Sonstiges',
};

export const RARITY_LABELS: Record<string, string> = {
  Common:      'Gewöhnlich',
  Uncommon:    'Ungewöhnlich',
  Rare:        'Selten',
  'Very Rare': 'Sehr selten',
  Legendary:   'Legendär',
  Artifact:    'Artefakt',
};

export const DAMAGE_TYPE_LABELS: Record<string, string> = {
  slashing:    'Hiebschaden',
  piercing:    'Stichschaden',
  bludgeoning: 'Wuchtschaden',
  fire:        'Feuerschaden',
  cold:        'Kälteschaden',
  lightning:   'Blitzschaden',
  thunder:     'Donnerschaden',
  acid:        'Säureschaden',
  poison:      'Giftschaden',
  necrotic:    'Nekrotischer Schaden',
  radiant:     'Strahlender Schaden',
  force:       'Wuchtmagie',
  psychic:     'Psychischer Schaden',
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  weapon: 'Waffe',
  armor:  'Rüstung',
  magic:  'Magischer Gegenstand',
  gear:   'Ausrüstung',
};

export const WEAPON_CATEGORY_LABELS: Record<string, string> = {
  Martial: 'Kriegswaffe',
  Simple:  'Einfache Waffe',
  Exotic:  'Exotische Waffe',
};

export const WEAPON_RANGE_LABELS: Record<string, string> = {
  Melee:  'Nahkampf',
  Ranged: 'Fernkampf',
};

export const ARMOR_CATEGORY_LABELS: Record<string, string> = {
  Light:  'Leichte Rüstung',
  Medium: 'Mittlere Rüstung',
  Heavy:  'Schwere Rüstung',
  Shield: 'Schild',
};

export const PROPERTY_LABELS: Record<string, string> = {
  versatile:   'Vielseitig',
  finesse:     'Finesse',
  light:       'Leicht',
  heavy:       'Schwer',
  'two-handed':'Zweihändig',
  thrown:      'Wurfwaffe',
  reach:       'Reichweite',
  loading:     'Laden',
  ammunition:  'Munition',
  special:     'Besonders',
  monk:        'Mönchswaffe',
};

/** Deutsch → index (für Rück-Mapping aus Edit-Eingabe) */
export const PROPERTY_INDEX_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(PROPERTY_LABELS).map(([index, label]) => [label.toLowerCase(), index])
);

export const COST_UNIT_LABELS: Record<string, string> = {
  gp: 'GM',
  sp: 'SM',
  cp: 'KM',
  ep: 'EM',
  pp: 'PM',
};

/** Fuß → Meter als Zahl (1,5 m pro 5 ft). */
export function ftToMVal(ft: number): number {
  const m = ft * 0.3;
  return parseFloat(m.toFixed(1));
}

/** Fuß → Meter als formatierter String. */
export function ftToM(ft: number): string {
  return ftToMVal(ft) + ' m';
}

/** Meter → Fuß (gerundet auf 5 ft). */
export function mToFt(m: number): number {
  return Math.round(m / 0.3 / 5) * 5 || Math.round(m / 0.3);
}

export function formatCost(cost: { quantity: number; unit: string }): string {
  return `${cost.quantity} ${COST_UNIT_LABELS[cost.unit] ?? cost.unit}`;
}

export function formatRarity(rarity: { name: string } | undefined): string {
  if (!rarity) return '—';
  return RARITY_LABELS[rarity.name] ?? rarity.name;
}

export function formatDamageDice(dice: string): string {
  return dice.replace(/\bd(\d+)\b/gi, (_, n) => `W${n}`);
}

/** DnD-API equipment_category.index → unsere Kategorie (= Ordnername). */
export const API_CATEGORY_MAP: Record<string, string> = {
  // Waffen
  'weapon':              'weapon',
  'martial-melee':       'weapon',
  'martial-ranged':      'weapon',
  'simple-melee':        'weapon',
  'simple-ranged':       'weapon',
  'martial-weapons':     'weapon',
  'simple-weapons':      'weapon',
  // Rüstung
  'armor':               'armor',
  'heavy-armor':         'armor',
  'medium-armor':        'armor',
  'light-armor':         'armor',
  'shields':             'armor',
  // Ausrüstung & Werkzeuge
  'ammunition':          'ammunition',
  'adventuring-gear':    'adventuring-gear',
  'tools':               'tools',
  'artisans-tools':      'tools',
  'gaming-sets':         'tools',
  'musical-instruments': 'tools',
  'other-tools':         'tools',
  'mounts-and-vehicles': 'mounts-and-vehicles',
  // Magische Gegenstände
  'wondrous-items':      'wondrous-items',
  'wundersam':           'wondrous-items', // legacy / Homebrew
  'ring':                'ring',
  'rod':                 'rod',
  'staff':               'staff',
  'wand':                'wand',
  'scroll':              'scroll',
  'potion':              'potion',
};

// Singleton-Cache: category dir → items
let cache: Record<string, ItemInfo[]> = {};

export function invalidateItemCache(dir?: string) {
  if (dir) {
    delete cache[dir];
  } else {
    cache = {};
  }
}

/** Lädt alle Items einer Kategorie (mit Cache). */
export async function getItemsByDir(dir: string): Promise<ItemInfo[]> {
  if (cache[dir]) return cache[dir];

  try {
    const files = await invoke<string[]>('list_json_files', { path: `${ITEMS_PATH}/${dir}` });
    const items = await Promise.all(
      files.map(async (filename) => {
        const path = `${ITEMS_PATH}/${dir}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          return {
            name: data.name ?? filename.replace('.json', ''),
            name_de: data.name_de,
            category: data.category ?? DIR_TO_CATEGORY[dir] ?? 'other',
            rarity: data.rarity ?? '—',
            weight: typeof data.weight === 'number' ? data.weight : undefined,
            path,
          };
        } catch {
          return { name: filename.replace('.json', ''), category: DIR_TO_CATEGORY[dir] ?? 'other', rarity: '—', path };
        }
      })
    );
    items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    cache[dir] = items;
    return items;
  } catch {
    cache[dir] = [];
    return [];
  }
}

export interface ItemSuggestion {
  item: ItemInfo;
  dir: string;
  filename: string;
}

/** Sucht über alle geladenen Kategorien nach Name. */
export function searchItems(
  loadedByDir: Record<string, ItemInfo[]>,
  query: string,
  maxResults = 10
): ItemSuggestion[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: ItemSuggestion[] = [];

  for (const [dir, items] of Object.entries(loadedByDir)) {
    for (const item of items) {
      const primary = (item.name_de ?? item.name).toLowerCase();
      const fallback = item.name.toLowerCase();
      if (primary.includes(q) || fallback.includes(q)) {
        const filename = item.path.split('/').pop() ?? '';
        results.push({ item, dir, filename });
      }
    }
  }

  results.sort((a, b) => {
    const aName = (a.item.name_de ?? a.item.name).toLowerCase();
    const bName = (b.item.name_de ?? b.item.name).toLowerCase();
    const aStart = aName.startsWith(q);
    const bStart = bName.startsWith(q);
    if (aStart !== bStart) return aStart ? -1 : 1;
    return aName.localeCompare(bName, 'de');
  });

  return results.slice(0, maxResults);
}
