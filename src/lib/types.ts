export interface Campaign {
  id: string;
  name: string;
  path: string;
}

export interface Session {
  id: string;
  title: string;
  path: string;
  date?: string;
}

export interface Npc {
  id: string;
  name: string;
  path: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'campaign' | 'act' | 'session' | 'npc' | 'world' | 'character' | 'monster' | 'encounter' | 'notes' | 'spell' | 'item';
  /** Set for directory-based characters (with PDF sheet) */
  dirPath?: string;
}

// --- Spell ---

export interface Spell {
  name: string;
  level: string;
  school: string;
  casting_time: string;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    materials_needed: string | null;
  };
  duration: string;
  ritual: boolean;
  classes: string[];
  description: string;
  higher_levels: string | null;
  source: string;
}

export type LlmProvider = 'ollama' | 'anthropic' | 'groq' | 'xai';

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

// --- Monster ---

export const MONSTER_SIZES = {
  Tiny:        'Winzig',
  Small:       'Klein',
  Medium:      'Mittelgroß',
  Large:       'Groß',
  Huge:        'Riesig',
  Gargantuan:  'Gigantisch',
} as const;
export type MonsterSize = keyof typeof MONSTER_SIZES;

export const MONSTER_TYPES = {
  aberration:  'Aberration',
  beast:       'Tier',
  celestial:   'Himmlisches',
  construct:   'Konstrukt',
  dragon:      'Drache',
  elemental:   'Elementar',
  fey:         'Fee',
  fiend:       'Teuflisches',
  giant:       'Riese',
  humanoid:    'Humanoid',
  monstrosity: 'Ungeheuer',
  ooze:        'Schleim',
  plant:       'Pflanze',
  undead:      'Untote',
} as const;
export type MonsterType = keyof typeof MONSTER_TYPES;

export const MONSTER_ALIGNMENTS = {
  'lawful good':              'Rechtschaffen Gut',
  'neutral good':             'Neutral Gut',
  'chaotic good':             'Chaotisch Gut',
  'lawful neutral':           'Rechtschaffen Neutral',
  'neutral':                  'Neutral',
  'chaotic neutral':          'Chaotisch Neutral',
  'lawful evil':              'Rechtschaffen Böse',
  'neutral evil':             'Neutral Böse',
  'chaotic evil':             'Chaotisch Böse',
  'unaligned':                'Unausgerichtet',
  'any alignment':            'Beliebige Gesinnung',
  'any good alignment':       'Beliebige gute Gesinnung',
  'any evil alignment':       'Beliebige böse Gesinnung',
  'any non-good alignment':   'Beliebige nicht-gute Gesinnung',
  'any non-lawful alignment': 'Beliebige nicht-rechtschaffene Gesinnung',
  'any chaotic alignment':    'Beliebige chaotische Gesinnung',
  'any lawful alignment':     'Beliebige rechtschaffene Gesinnung',
} as const;
export type MonsterAlignment = keyof typeof MONSTER_ALIGNMENTS;

export function monsterSizeLabel(size: string): string {
  return MONSTER_SIZES[size as MonsterSize] ?? size;
}
export function monsterTypeLabel(type: string): string {
  return MONSTER_TYPES[type as MonsterType] ?? type;
}
export function monsterAlignmentLabel(alignment: string): string {
  return MONSTER_ALIGNMENTS[alignment as MonsterAlignment] ?? alignment;
}

export interface MonsterDamage {
  dice: string;        // z.B. "2d6+3"
  type: string;        // z.B. "Feuer" (übersetzbar)
}

export interface MonsterAction {
  name: string;
  description: string;
  attack_bonus?: number;
  damage?: MonsterDamage[];
}

export interface Monster {
  index?: string;       // API-Slug (leer bei Homebrew)
  source?: string;      // 'SRD' | 'Homebrew'
  name: string;
  size: MonsterSize;
  type: MonsterType;
  alignment: MonsterAlignment;
  ac: { value: number; note: string };
  hp: { average: number; formula: string };
  speed: string;
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  saving_throws: Record<string, string>;
  skills: Record<string, string>;
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: string[];
  senses: string;
  languages: string;
  cr: string;
  xp: number;
  traits: MonsterAction[];
  actions: MonsterAction[];
  reactions: MonsterAction[];
  legendary_actions: MonsterAction[];
}

/** Migriert alte String-Schadensfelder in MonsterDamage[]. Idempotent. */
export function normalizeMonster(m: Monster): Monster {
  m.traits ??= []; m.actions ??= []; m.reactions ??= []; m.legendary_actions ??= [];
  m.damage_resistances ??= []; m.damage_immunities ??= [];
  m.condition_immunities ??= []; m.saving_throws ??= {}; m.skills ??= {};
  m.ac ??= { value: 10, note: '' }; m.hp ??= { average: 0, formula: '' };
  m.stats ??= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  for (const arr of [m.traits, m.actions, m.reactions, m.legendary_actions]) {
    for (const a of arr) {
      if (typeof a.damage === 'string') {
        const s = a.damage as string;
        const last = s.lastIndexOf(' ');
        a.damage = last === -1 ? [{ dice: s, type: '' }] : [{ dice: s.slice(0, last), type: s.slice(last + 1) }];
      }
    }
  }
  return m;
}

export const MONSTER_TEMPLATE: Monster = {
  name: 'Neues Monster',
  size: 'Medium',
  type: 'humanoid',
  alignment: 'neutral',
  ac: { value: 10, note: '' },
  hp: { average: 11, formula: '2d8+2' },
  speed: '9 m',
  stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saving_throws: {},
  skills: {},
  damage_resistances: [],
  damage_immunities: [],
  condition_immunities: [],
  senses: 'passive Wahrnehmung 10',
  languages: '—',
  cr: '1/4',
  xp: 50,
  traits: [],
  actions: [{ name: 'Angriff', description: 'Nahkampfwaffenangriff: +2 zum Angriff, Reichweite 1,5 m, ein Ziel. Treffer: 3 (1W4+1) Stichschaden.' }],
  reactions: [],
  legendary_actions: [],
};

// --- Item ---
// Lehnt sich ans DnD-API-Schema an. item_type entspricht der API-Trennung:
//   weapon / armor  → /api/2014/equipment
//   magic           → /api/2014/magic-items
//   gear            → sonstiges Equipment (Werkzeug, Ausrüstung, …)

export interface Item {
  // Identifikation
  index?: string;          // API-Slug, leer bei Homebrew
  name: string;            // Originalname (Englisch oder Deutsch bei Homebrew)
  name_de?: string;        // Übersetzter Name (nur wenn aus API importiert)

  // Typ-Diskriminante — analog DnD-API-Kategorien
  item_type?: 'weapon' | 'armor' | 'magic' | 'gear';

  equipment_category?: { index: string; name: string };

  // Magische Gegenstände (item_type === 'magic')
  rarity?: { name: string };   // z.B. { name: "Uncommon" }
  attunement?: boolean;
  attunement_by?: string | null;  // z.B. "a wizard"
  variant?: boolean;
  variants?: string[];

  // Waffen (item_type === 'weapon')
  weapon_category?: string;   // "Martial" | "Simple"
  weapon_range?: string;      // "Melee" | "Ranged"
  damage?: {
    damage_dice: string;
    damage_type: { index: string; name: string };
  };
  two_handed_damage?: {
    damage_dice: string;
    damage_type: { index: string; name: string };
  };
  range?: { normal: number; long?: number };
  throw_range?: { normal: number; long: number };
  properties?: Array<{ index: string; name: string }>;

  // Rüstungen (item_type === 'armor')
  armor_category?: string;   // "Light" | "Medium" | "Heavy" | "Shield"
  armor_class?: { base: number; dex_bonus: boolean; max_bonus: number | null };
  str_minimum?: number;
  stealth_disadvantage?: boolean;

  // Beschreibung
  desc: string[];          // Absätze auf Englisch
  desc_de?: string[];      // Übersetzte Absätze

  // Allgemein
  cost?: { quantity: number; unit: string };
  weight?: number;         // in lbs (Originalwert)

  source: string;          // "SRD" | "Homebrew" | "eigen"
  url?: string;            // API-URL wenn aus SRD
}

// --- Encounter ---

export interface EncounterMonster {
  slug: string;
  count: number;
  notes: string;
}

export interface Encounter {
  name: string;
  description: string;
  read_aloud?: string;
  monsters: EncounterMonster[];
  difficulty: 'leicht' | 'mittel' | 'schwer' | 'tödlich';
  xp_total: number;
  party_size: number;
  party_level: number;
  location: string;
  loot: string;
  notes: string;
  status: 'planned' | 'done' | 'skipped';
}
