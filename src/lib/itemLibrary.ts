/**
 * Lädt und cached den Item-Index aus vault/items.
 * Stellt Suchfunktionen bereit.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Item } from './types';
import { OWN_SOURCE, WEAPON_MASTERIES, type WeaponMastery } from './schemas/shared';
import type { EquipmentChoiceCategory } from './schemas/wizardEquipment';
import { itemKeyOf } from './schemas/item';

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
  // ── Waffen-Facetten ──
  // Der Index liest die Datei ohnehin vollständig; diese drei Felder mitzunehmen
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

/**
 * Kategorie-Schlüssel = Ordnername = Open5e-v2 category.key (24 Werte).
 * Identity-Mapping: vault/items/{key}/ enthält Items dieser Kategorie.
 */

/** Farbe pro Kategorie (Catppuccin Mocha Palette) */
export const CATEGORY_COLORS: Record<string, string> = {
  'weapon':             'var(--danger)',
  'armor':              'var(--red)',
  'shield':             'var(--red-bright)',
  'ammunition':         'var(--teal)',
  'adventuring-gear':   'var(--magenta)',
  'equipment-pack':     'var(--magenta)',
  'tools':              'var(--steel)',
  'spellcasting-focus': 'var(--arcane)',
  'mount':              'var(--red-bright)',
  'land-vehicle':       'var(--copper)',
  'waterborne-vehicle': 'var(--steel)',
  'wondrous-item':      'var(--arcane)',
  'ring':               'var(--gold)',
  'rod':                'var(--copper)',
  'staff':              'var(--danger)',
  'wand':               'var(--magenta)',
  'scroll':             'var(--steel)',
  'potion':             'var(--green)',
  'poison':             'var(--green)',
  'gem':                'var(--arcane)',
  'jewelry':            'var(--gold)',
  'art':                'var(--copper)',
  'trade-good':         'var(--steel)',
  'service':            'var(--ink-muted)',
  'other':              'var(--ink-muted)',
};

/** Legacy-Ordner (dnd5eapi/2014) → Open5e-Kategorie; fängt unangetasteten Homebrew ab. */
const LEGACY_DIR_ALIASES: Record<string, string> = {
  'wondrous-items': 'wondrous-item',
  'mounts-and-vehicles': 'mount',
  'shields': 'shield',
};

/** Ordnername → Kategorie-Schlüssel (identity + Legacy-Aliase). */
export const DIR_TO_CATEGORY: Record<string, string> = {
  ...Object.fromEntries(Object.keys(CATEGORY_COLORS).map((k) => [k, k])),
  ...LEGACY_DIR_ALIASES,
};

/** Kategorie-Schlüssel → Ordnername (identity; Neu-Anlage nutzt die aktuellen Keys). */
export const CATEGORY_TO_DIR: Record<string, string> = Object.fromEntries(
  Object.keys(CATEGORY_COLORS).map((k) => [k, k]),
);

export const CATEGORY_LABELS: Record<string, string> = {
  'weapon':             'Waffe',
  'armor':              'Rüstung',
  'shield':             'Schild',
  'ammunition':         'Munition',
  'adventuring-gear':   'Ausrüstung',
  'equipment-pack':     'Ausrüstungspaket',
  'tools':              'Werkzeug',
  'spellcasting-focus': 'Zauberfokus',
  'mount':              'Reittier',
  'land-vehicle':       'Landfahrzeug',
  'waterborne-vehicle': 'Wasserfahrzeug',
  'wondrous-item':      'Wundersamer Gegenstand',
  'ring':               'Ring',
  'rod':                'Rute',
  'staff':              'Stab',
  'wand':               'Zauberstab',
  'scroll':             'Schriftrolle',
  'potion':             'Trank',
  'poison':             'Gift',
  'gem':                'Edelstein',
  'jewelry':            'Schmuck',
  'art':                'Kunstgegenstand',
  'trade-good':         'Handelsware',
  'service':            'Dienstleistung',
  'other':              'Sonstiges',
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
  thunder:     'Schallschaden',
  acid:        'Säureschaden',
  poison:      'Giftschaden',
  necrotic:    'Nekrotischer Schaden',
  radiant:     'Gleißender Schaden',
  force:       'Energieschaden',
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

// ── Meisterschaftseigenschaften (Weapon Mastery, 5e 2024) ─────────────────────
//
// Das Vokabular selbst steht in `schemas/shared.ts` (WEAPON_MASTERIES), damit Zod
// es nutzen kann; hier liegen Anzeigename und Regeltext — bei den übrigen
// Anzeige-Vokabularen des Item-Bereichs.
//
// Die Texte sind EINMALIG abgeschrieben: englisch aus SRD 5.2, deutsch aus dem
// Repo-Auszug `src/lib/data/rules-chunks.json` (`waffen-auslaugen-p103` …), beide
// CC-BY-4.0. `rules-chunks.json` bleibt reines KI-Material und wird zur Laufzeit
// NICHT gelesen.
//
// `Record<WeaponMastery, …>` macht Vollständigkeit zum Compilerfehler — dasselbe
// Mittel wie bei WEAPON_LABEL_DE/ARMOR_LABEL_DE in services/proficiencyGrants.ts.

export const MASTERY_INFO: Record<WeaponMastery, { nameDe: string; desc: string; descDe: string }> = {
  Sap: {
    nameDe: 'Auslaugen',
    desc: 'If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst, ist diese Kreatur bei ihrem nächsten Angriffswurf vor Beginn deines nächsten Zugs im Nachteil.',
  },
  Nick: {
    nameDe: 'Einkerben',
    desc: 'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.',
    descDe: 'Wenn du den zusätzlichen Angriff der Eigenschaft Leicht ausführst, kannst du dies als Teil der Angriffsaktion statt als Bonusaktion tun. Du kannst diesen zusätzlichen Angriff nur einmal pro Zug ausführen.',
  },
  Vex: {
    nameDe: 'Plagen',
    desc: 'If you hit a creature with this weapon and deal damage to the creature, you have Advantage on your next attack roll against that creature before the end of your next turn.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst und ihr Schaden zufügst, bist du beim nächsten Angriffswurf gegen diese Kreatur vor Ende deines nächsten Zugs im Vorteil.',
  },
  Cleave: {
    nameDe: 'Spalten',
    desc: "If you hit a creature with a melee attack roll using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn.",
    descDe: 'Wenn du eine Kreatur mit einem Nahkampfangriffswurf triffst, den du mit dieser Waffe ausführst, kannst du mit der Waffe einen weiteren Nahkampfangriff auf eine zweite Kreatur im Abstand von bis zu 1,5 Metern von der ersten ausführen, sofern die zweite sich ebenfalls in Reichweite befindet. Bei einem Treffer erleidet die Kreatur den Waffenschaden. Du fügst dem Schaden jedoch nicht deinen Attributsmodifikator hinzu, sofern dieser Modifikator nicht negativ ist. Du kannst diesen zusätzlichen Angriff nur einmal pro Zug ausführen.',
  },
  Push: {
    nameDe: 'Stoßen',
    desc: 'If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst, kannst du sie bis zu drei Meter weit in gerader Linie von dir wegstoßen, sofern sie von höchstens großer Größe ist.',
  },
  Graze: {
    nameDe: 'Streifen',
    desc: 'If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier.',
    descDe: 'Wenn dein Angriffswurf mit dieser Waffe eine Kreatur verfehlt, kannst du der Kreatur Schaden in Höhe des Attributsmodifikators zufügen, den du für den Angriffswurf verwendet hast. Die Schadensart entspricht der Waffe. Der Schaden kann nur durch Erhöhen des Attributsmodifikators erhöht werden.',
  },
  Topple: {
    nameDe: 'Umstoßen',
    desc: 'If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus). On a failed save, the creature has the Prone condition.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst, kannst du sie zu einem Konstitutionsrettungswurf (SG 8 plus Attributsmodifikator für den Angriffswurf plus dein Übungsbonus) zwingen. Misslingt der Wurf, so wird die Kreatur umgestoßen und hat den Zustand Liegend.',
  },
  Slow: {
    nameDe: 'Verlangsamen',
    desc: "If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If the creature is hit more than once by weapons that have this property, the Speed reduction doesn't exceed 10 feet.",
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst und ihr Schaden zufügst, kannst du ihre Bewegungsrate bis zum Beginn deines nächsten Zugs um drei Meter verringern. Wird die Kreatur mehrfach von Waffen mit dieser Eigenschaft getroffen, so wird ihre Bewegungsrate dennoch nur um drei Meter verringert.',
  },
};

/** Deutscher Anzeigename einer Meisterschaftseigenschaft („Sap" → „Auslaugen"). */
export const MASTERY_LABELS: Record<WeaponMastery, string> = Object.fromEntries(
  WEAPON_MASTERIES.map((m) => [m, MASTERY_INFO[m].nameDe]),
) as Record<WeaponMastery, string>;

/** Rückrichtung (deutscher Name kleingeschrieben → Enum-Wert); für den PDF-Import. */
export const MASTERY_BY_LABEL: Record<string, WeaponMastery> = Object.fromEntries(
  WEAPON_MASTERIES.map((m) => [MASTERY_INFO[m].nameDe.toLowerCase(), m]),
);

/** Anzeigename; unbekannte Werte (Fremdimport) unverändert durchreichen. */
export function masteryLabel(mastery: string | undefined | null): string {
  return mastery ? (MASTERY_LABELS[mastery as WeaponMastery] ?? mastery) : '';
}

/** Regeltext (deutsch) einer Meisterschaftseigenschaft; leer bei unbekanntem Wert. */
export function masteryRuleDe(mastery: string | undefined | null): string {
  return mastery ? (MASTERY_INFO[mastery as WeaponMastery]?.descDe ?? '') : '';
}

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

/**
 * equipment_category.index → unsere Kategorie (= Ordnername). Open5e liefert bereits
 * die 24 Ziel-Keys (Identity); zusätzlich Back-Compat für Legacy-/Homebrew-Werte.
 */
export const API_CATEGORY_MAP: Record<string, string> = {
  ...Object.fromEntries(Object.keys(CATEGORY_COLORS).map((k) => [k, k])),
  // Back-Compat (dnd5eapi/2014 & Homebrew)
  'wondrous-items':      'wondrous-item',
  'wundersam':           'wondrous-item',
  'mounts-and-vehicles': 'mount',
  'shields':             'shield',
};

// ── Typ-Ableitung (Single Source of Truth = equipment_category) ───────────────

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

// ── Anlage-Helfer (Create-Modal) ──────────────────────────────────────────────

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

// Singleton-Cache: category dir → items
let cache: Record<string, ItemInfo[]> = {};

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
            // Nicht `data.key`: Homebrew ohne Key wäre sonst nicht verlinkbar.
            key: itemKeyOf(data) || undefined,
            index: data.index,
            magic: isMagicItem(data),
            weapon_category: data.weapon_category,
            weapon_range: data.weapon_range,
            // Nur ein Wert aus dem geschlossenen Vokabular kommt durch — eine falsch
            // gepflegte Datei liefert `undefined` statt einen Fremdwert weiterzutragen.
            mastery: (WEAPON_MASTERIES as readonly string[]).includes(data.mastery) ? data.mastery : undefined,
          };
        } catch {
          return { name: filename.replace('.json', ''), category: DIR_TO_CATEGORY[dir] ?? 'other', rarity: '—', magic: false, path };
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

// ─── Auflösung: Charakter-/NPC-Eintrag → Bibliothekseintrag ───────────────────
//
// Index statt linearer Suche: der Bogen löst ~1000 Items gegen bis zu 55 Zeilen auf.

export interface ItemIndex {
  byKey: Map<string, ItemInfo>;
  /** Kleingeschrieben, deutscher UND englischer Name — beide Schreibweisen kommen vor. */
  byName: Map<string, ItemInfo>;
  /** Namen, die mehr als ein Item treffen: anzeigen ja, automatisch verlinken nein. */
  ambiguous: Set<string>;
}

export function buildItemIndex(loadedByDir: Record<string, ItemInfo[]>): ItemIndex {
  const byKey = new Map<string, ItemInfo>();
  const byName = new Map<string, ItemInfo>();
  const ambiguous = new Set<string>();

  const addName = (name: string | undefined, item: ItemInfo) => {
    const k = name?.trim().toLowerCase();
    if (!k) return;
    if (byName.has(k)) {
      if (byName.get(k)?.path !== item.path) ambiguous.add(k);
      return;
    }
    byName.set(k, item);
  };

  for (const items of Object.values(loadedByDir)) {
    for (const item of items) {
      if (item.key) byKey.set(item.key, item);
      addName(displayName(item), item);
      if (item.name_de) addName(item.name, item);
    }
  }

  return { byKey, byName, ambiguous };
}

/** Bibliothekseintrag zu einem Verweis; `undefined` = die Bibliothek kennt ihn nicht. */
export function matchItem(
  index: ItemIndex,
  ref: { sourceKey?: string; name?: string },
): ItemInfo | undefined {
  const key = ref.sourceKey?.trim();
  if (key) {
    const hit = index.byKey.get(key);
    // Kein früher Ausstieg bei Fehltreffer: ein Key aus einer nicht installierten
    // Bibliothek darf trotzdem über den Namen auflösen.
    if (hit) return hit;
  }
  const name = ref.name?.trim().toLowerCase();
  return name ? index.byName.get(name) : undefined;
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
