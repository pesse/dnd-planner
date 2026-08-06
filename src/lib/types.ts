// Entity-Typen kommen aus den Zod-Schemas (Single Source of Truth, siehe schemas/).
// Label-Maps, Helper und Templates bleiben hier. normalize*/parse* leben in
// utils/schemaValidation.ts.
import type { Spell, SpellDamage } from './schemas/spell';
import type { Monster, MonsterAction, MonsterDamage } from './schemas/monster';
import type { Item } from './schemas/item';
import type { Encounter, EncounterMonster } from './schemas/encounter';
import type { Character, CharacterSpells, Attack, SpellEntry, ProficiencyFlags, PersonalData } from './schemas/characterSchema';
import type { ClassProgression, ClassFeature } from './schemas/classProgression';
import type { Species, Trait } from './schemas/species';
import type { Feat } from './schemas/feat';
import type { Background, Benefit } from './schemas/background';
import { OWN_SOURCE } from './schemas/source';
import { emptyProficiencyGrant, emptySkillGrant } from './schemas/grants';
import {
  MONSTER_ALIGNMENTS,
  MONSTER_SIZES,
  MONSTER_SIZE_KEYS,
  MONSTER_TYPES,
  SPELL_SCHOOLS,
} from './schemas/vocabulary';
import type {
  MonsterAlignment,
  MonsterSize,
  MonsterType,
  SpellSchool,
} from './schemas/vocabulary';
export type { Spell, SpellDamage, Monster, MonsterAction, MonsterDamage, Item, Encounter, EncounterMonster };
export type { Character, CharacterSpells, Attack, SpellEntry, ProficiencyFlags, PersonalData };
export type { ClassProgression, ClassFeature, Species, Trait, Feat, Background, Benefit };

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

export type FileEntryType =
  | 'campaign' | 'act' | 'session' | 'npc' | 'world' | 'character'
  | 'monster' | 'encounter' | 'notes' | 'spell' | 'item' | 'class' | 'species' | 'feat' | 'background';

export interface FileEntry {
  name: string;
  path: string;
  type: FileEntryType;
  /** Nur bei ordnerbasierten Charakteren (mit PDF-Bogen). */
  dirPath?: string;
}


export const SPELL_CLASS_LABELS = {
  sorcerer:  'Zauberer',
  wizard:    'Magier',
  bard:      'Barde',
  druid:     'Druide',
  ranger:    'Waldläufer',
  cleric:    'Kleriker',
  warlock:   'Hexenmeister',
  paladin:   'Paladin',
  artificer: 'Erfinder',
} as const;
export type SpellClassKey = keyof typeof SPELL_CLASS_LABELS;
export const SPELL_CLASS_KEYS = Object.keys(SPELL_CLASS_LABELS) as SpellClassKey[];

/** Deutsches Label über eine Vokabular-Map, unbekannter Wert bleibt unübersetzt stehen. */
export function labelOf<T extends Record<string, string>>(map: T, value: string): string {
  return map[value as keyof T] ?? value;
}

export function spellLevelLabel(level: number): string {
  return level === 0 ? 'Zaubertrick' : `${level}. Grad`;
}

export function spellSchoolLabel(school: string): string {
  return labelOf(SPELL_SCHOOLS, school);
}

/** „V, G, M"; ohne Komponenten „—". */
export function spellComponents(spell: Spell): string {
  const parts: string[] = [];
  if (spell.components.verbal) parts.push('V');
  if (spell.components.somatic) parts.push('G');
  if (spell.components.material) parts.push('M');
  return parts.join(', ') || '—';
}

export function spellDesc(spell: Spell): string {
  const arr = spell.desc_de?.length ? spell.desc_de : spell.desc;
  return (arr ?? []).join('\n\n');
}

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
  /** Gewinnt gegen das Task-Preset der Call-Site. */
  temperature?: number;
}

// Re-Export statt zweiter Tabelle: die Größen sind auch das Vokabular der
// Charaktereigenschaft `size`, und ein Import von `schemas/vocabulary.ts` hierher wäre ein Zyklus.
export { MONSTER_SIZES, MONSTER_SIZE_KEYS, MONSTER_TYPES, MONSTER_ALIGNMENTS, SPELL_SCHOOLS };
export type { MonsterSize, MonsterType, MonsterAlignment, SpellSchool };


/** Creature-Type → Vault-Unterordner; bestimmt die Ablage. */
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


/** Über die Keys von `MONSTER_ALIGNMENTS` abgeleitet — nur EINE Gesinnungstabelle. */
export const CHARACTER_ALIGNMENTS_DE: string[] = ([
  'lawful good', 'neutral good', 'chaotic good',
  'lawful neutral', 'neutral', 'chaotic neutral',
  'lawful evil', 'neutral evil', 'chaotic evil',
] as const satisfies readonly MonsterAlignment[]).map((k) => MONSTER_ALIGNMENTS[k]);

export const SIZE_CATEGORIES_DE: string[] = Object.values(MONSTER_SIZES);

export function monsterSizeLabel(size: string): string {
  return labelOf(MONSTER_SIZES, size);
}
export function monsterTypeLabel(type: string): string {
  return labelOf(MONSTER_TYPES, type);
}
export function monsterAlignmentLabel(alignment: string): string {
  return labelOf(MONSTER_ALIGNMENTS, alignment);
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

export const CLASS_TEMPLATE: ClassProgression = {
  key: '',
  source: OWN_SOURCE,
  name: 'Neue Klasse',
  nameDe: 'Neue Klasse',
  casterType: 'NONE',
  hitDie: 8,
  hpAt1st: '',
  hpHigher: '',
  proficiencyGrant: emptyProficiencyGrant(),
  skillGrantMulticlass: emptySkillGrant(),
  startingEquipment: '',
  startingEquipmentDe: '',
  document: { key: OWN_SOURCE, gamesystem: '5e-2024' },
  levels: [],
  features: [],
};

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

export const FEAT_TEMPLATE: Feat = {
  key: '',
  source: OWN_SOURCE,
  name: 'Neues Talent',
  nameDe: 'Neues Talent',
  category: 'General',
  prerequisite: '',
  desc: '',
  document: { key: OWN_SOURCE, gamesystem: '5e-2024' },
};

export const BACKGROUND_TEMPLATE: Background = {
  key: '',
  source: OWN_SOURCE,
  name: 'Neuer Hintergrund',
  nameDe: 'Neuer Hintergrund',
  desc: '',
  abilityScores: [],
  featKey: '',
  proficiencyGrant: emptyProficiencyGrant(),
  document: { key: OWN_SOURCE, gamesystem: '5e-2024' },
  benefits: [],
};
