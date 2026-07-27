// Entity-Typen kommen aus den Zod-Schemas (Single Source of Truth, siehe schemas/).
// Label-Maps, Helper und Templates bleiben hier. normalize*/parse* leben in
// utils/schemaValidation.ts.
import type { Spell, SpellDamage } from './schemas/spell';
import type { Monster, MonsterAction, MonsterDamage } from './schemas/monster';
import type { Item } from './schemas/item';
import type { Encounter, EncounterMonster } from './schemas/encounter';
import type { Character, CharacterSpells, Attack, SpellEntry, ProficiencyFlags, PersonalData } from './schemas/character';
import type { ClassProgression, ClassFeature } from './schemas/classProgression';
import type { Species, Trait } from './schemas/species';
import type { Feat } from './schemas/feat';
import { OWN_SOURCE } from './schemas/shared';
export type { Spell, SpellDamage, Monster, MonsterAction, MonsterDamage, Item, Encounter, EncounterMonster };
export type { Character, CharacterSpells, Attack, SpellEntry, ProficiencyFlags, PersonalData };
export type { ClassProgression, ClassFeature, Species, Trait, Feat };

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
  type: 'campaign' | 'act' | 'session' | 'npc' | 'world' | 'character' | 'monster' | 'encounter' | 'notes' | 'spell' | 'item' | 'class' | 'species' | 'feat';
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
  source: OWN_SOURCE,
};

export type LlmProvider = 'ollama' | 'anthropic' | 'groq' | 'qualityminds';

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

/** Creature-Type → Vault-Unterordner (deutsche Plural-Kategorie). Bestimmt die Ablage. */
export const MONSTER_TYPE_DIR: Record<MonsterType, string> = {
  aberration:  'aberrationen',
  beast:       'tiere',
  celestial:   'himmlische',
  construct:   'konstrukte',
  dragon:      'drachen',
  elemental:   'elementare',
  fey:         'feen',
  fiend:       'teuflische',
  giant:       'riesen',
  humanoid:    'humanoide',
  monstrosity: 'ungeheuer',
  ooze:        'schleime',
  plant:       'pflanzen',
  undead:      'untote',
};

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

export const MONSTER_TEMPLATE: Monster = {
  name: 'Neues Monster',
  source: OWN_SOURCE,
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

// --- Item --- (Typ + Schema in schemas/item.ts)

// --- Encounter --- (Typ + Schema in schemas/encounter.ts)

// --- Klasse (Regel-Bibliothek) --- (Typ + Schema in schemas/classProgression.ts)

export const CLASS_TEMPLATE: ClassProgression = {
  key: '',
  source: OWN_SOURCE,
  name: 'Neue Klasse',
  nameDe: 'Neue Klasse',
  casterType: 'NONE',
  hitDie: 8,
  hpAt1st: '',
  hpHigher: '',
  savingThrows: [],
  document: { key: OWN_SOURCE, gamesystem: '5e-2024' },
  levels: [],
  features: [],
};

// --- Spezies (Regel-Bibliothek) --- (Typ + Schema in schemas/species.ts)

export const SPECIES_TEMPLATE: Species = {
  key: '',
  source: OWN_SOURCE,
  name: 'Neue Spezies',
  nameDe: 'Neue Spezies',
  size: '',
  speed: '',
  document: { key: OWN_SOURCE, gamesystem: '5e-2024' },
  traits: [],
};

// --- Talent (Regel-Bibliothek) --- (Typ + Schema in schemas/feat.ts)

export const FEAT_TEMPLATE: Feat = {
  key: '',
  source: OWN_SOURCE,
  name: 'Neues Talent',
  nameDe: 'Neues Talent',
  prerequisite: '',
  desc: '',
  document: { key: OWN_SOURCE, gamesystem: '5e-2024' },
};
