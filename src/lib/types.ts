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

export const SPELL_SCHOOLS = {
  abjuration:    'Bannmagie',
  conjuration:   'Beschwörung',
  divination:    'Erkenntnismagie',
  enchantment:   'Verzauberung',
  evocation:     'Hervorrufung',
  illusion:      'Illusionsmagie',
  necromancy:    'Nekromantie',
  transmutation: 'Verwandlung',
} as const;
export type SpellSchool = keyof typeof SPELL_SCHOOLS;

export const SPELL_CLASS_LABELS: Record<string, string> = {
  sorcerer:  'Zauberer',
  wizard:    'Magier',
  bard:      'Barde',
  druid:     'Druide',
  ranger:    'Waldläufer',
  cleric:    'Kleriker',
  warlock:   'Hexenmeister',
  paladin:   'Paladin',
  artificer: 'Erfinder',
};
export const SPELL_CLASS_KEYS = ['sorcerer', 'wizard', 'bard', 'druid', 'ranger', 'cleric', 'warlock', 'paladin', 'artificer'] as const;

export interface SpellDamage {
  damage_type: { index: string; name: string };
  damage_at_slot_level?: Record<string, string>;
  damage_at_character_level?: Record<string, string>;
}

export interface Spell {
  index?: string;          // API-Slug (leer bei Homebrew)
  name: string;
  level: number;           // 0 = Zaubertrick, 1–9
  school: SpellSchool;
  casting_time: string;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    materials_needed: string | null;
  };
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  desc: string[];          // Englische Beschreibung (Absätze, aus API)
  desc_de?: string[];      // Deutsche Übersetzung
  higher_level?: string[] | null;
  higher_level_de?: string[] | null;
  damage?: SpellDamage;
  dc?: {
    dc_type: { index: string; name: string };
    dc_success: string;    // 'half' | 'none' | 'other'
  };
  area_of_effect?: {
    type: string;          // 'sphere' | 'cone' | 'cube' | 'line' | 'cylinder'
    size: number;          // in Fuß
  };
  source: string;
}

export function spellLevelLabel(level: number): string {
  return level === 0 ? 'Zaubertrick' : `${level}. Grad`;
}

/** Zeigt deutsche Beschreibung, fällt auf Englisch zurück. */
export function spellDesc(spell: Spell): string {
  const arr = spell.desc_de?.length ? spell.desc_de : spell.desc;
  return (arr ?? []).join('\n\n');
}

/** Zeigt deutsche Aufwertung, fällt auf Englisch zurück. Null wenn leer. */
export function spellHigherLevel(spell: Spell): string | null {
  const arr = spell.higher_level_de?.length ? spell.higher_level_de
            : spell.higher_level?.length    ? spell.higher_level
            : null;
  return arr ? arr.join('\n\n') : null;
}

/** Migriert alte Felder auf das neue Schema. Idempotent. */
export function normalizeSpell(raw: Record<string, unknown>): Spell {
  const s = raw as unknown as Spell & {
    description?: string;
    higher_levels?: string | null;
    level?: number | string;
  };

  // level: string → number
  if (typeof s.level === 'string') {
    s.level = (s.level === 'cantrip' || s.level === '0') ? 0 : (parseInt(s.level as string) || 0);
  }
  s.level ??= 0;

  // description (alt) → desc_de
  if (typeof (s as unknown as Record<string, unknown>)['description'] === 'string') {
    const d = (s as unknown as Record<string, unknown>)['description'] as string;
    s.desc_de = s.desc_de ?? [d];
    delete (s as unknown as Record<string, unknown>)['description'];
  }

  // higher_levels (alt) → higher_level_de
  if ('higher_levels' in (s as unknown as Record<string, unknown>)) {
    const hl = (s as unknown as Record<string, unknown>)['higher_levels'] as string | null;
    if (hl) s.higher_level_de = s.higher_level_de ?? [hl];
    delete (s as unknown as Record<string, unknown>)['higher_levels'];
  }

  // Defaults
  s.desc          ??= [];
  s.concentration ??= false;
  s.classes       ??= [];
  s.school        ??= 'evocation' as SpellSchool;
  s.components    ??= { verbal: false, somatic: false, material: false, materials_needed: null };
  s.components.materials_needed ??= null;
  s.source        ??= 'Homebrew';

  return s as Spell;
}

export const SPELL_TEMPLATE: Spell = {
  name: 'Neuer Zauber',
  level: 1,
  school: 'evocation',
  casting_time: '1 Aktion',
  range: '9 m',
  components: { verbal: true, somatic: true, material: false, materials_needed: null },
  duration: 'Unmittelbar',
  concentration: false,
  ritual: false,
  classes: [],
  desc: [],
  desc_de: ['Zauberbeschreibung…'],
  source: 'Homebrew',
};

export type LlmProvider = 'ollama' | 'anthropic' | 'groq' | 'xai' | 'qualityminds';

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  /** Globaler Temperature-Override. Wenn gesetzt, gewinnt er gegen das Task-Preset des Call-Sites. */
  temperature?: number;
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
  /** Magischer Bonus auf Angriffs- und Schadenswürfe (+1, +2, +3). Strukturiert,
   *  da die DnD-API/SRD den Wert nur im Beschreibungstext führt. */
  magic_bonus?: number;

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
