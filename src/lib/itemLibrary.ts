/**
 * Lädt und cached den Item-Index aus vault/items.
 * Stellt Suchfunktionen bereit.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Item } from './types';

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
  'weapon':              'var(--danger)',
  'armor':               'var(--red)',
  'ammunition':          'var(--teal)',
  'adventuring-gear':    'var(--magenta)',
  'tools':               'var(--steel)',
  'mounts-and-vehicles': 'var(--red-bright)',
  'wondrous-items':      'var(--arcane)',
  'ring':                'var(--gold)',
  'rod':                 'var(--copper)',
  'staff':               'var(--danger)',
  'wand':                'var(--magenta)',
  'scroll':              'var(--steel)',
  'potion':              'var(--green)',
  'other':               'var(--ink-muted)',
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

/** Farbe pro Seltenheit (D&D-Konvention, ans Pergament-Theme angepasst). */
export const RARITY_COLORS: Record<string, string> = {
  Common:      'var(--ink-muted)', // neutral
  Uncommon:    'var(--green)',
  Rare:        'var(--steel)',     // blau
  'Very Rare': 'var(--arcane)',    // violett
  Legendary:   'var(--copper)',    // orange
  Artifact:    'var(--danger)',    // rot
};

/** Seltenheitsfarbe; ohne Seltenheit (gewöhnliche Items) → neutrale „Common"-Farbe. */
export function rarityColor(rarity?: string | { name?: string } | null): string {
  const name = typeof rarity === 'string' ? rarity : rarity?.name;
  return (name && RARITY_COLORS[name]) || RARITY_COLORS.Common;
}

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

// ── Typ-Ableitung (Single Source of Truth = equipment_category) ───────────────

/** Grobe „Schublade" einer Kategorie. Magie-Kategorien (Ring, Trank …) liefern hier `magic`. */
export function categoryToCoarseType(catKey: string): 'weapon' | 'armor' | 'magic' | 'gear' {
  if (catKey === 'weapon' || catKey === 'ammunition') return 'weapon';
  if (catKey === 'armor') return 'armor';
  if (['ring', 'rod', 'staff', 'wand', 'scroll', 'potion', 'wondrous-items'].includes(catKey)) return 'magic';
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

// ── Anlage-Helfer (Create-Modal) ──────────────────────────────────────────────

/** Leeres Item für die gewählte Kategorie (equipment_category passend gesetzt). */
export function blankItem(name: string, dir: string): Item {
  const apiName = dir.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return {
    name,
    name_de: name,
    equipment_category: { index: dir, name: apiName },
    desc: [],
    desc_de: [],
    source: 'eigen',
  };
}

/** Vorlage → anpassbare Homebrew-Kopie (ohne Verknüpfung zur Quelle). */
export function toHomebrewCopy(item: Item): Item {
  return { ...item, source: 'eigen', index: undefined, url: undefined };
}

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
