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
  type: 'campaign' | 'act' | 'session' | 'npc' | 'world' | 'character' | 'monster' | 'encounter' | 'notes';
  /** Set for directory-based characters (with PDF sheet) */
  dirPath?: string;
}

export type LlmProvider = 'ollama' | 'anthropic' | 'groq' | 'xai';

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

// --- Monster ---

export interface MonsterAction {
  name: string;
  description: string;
  attack_bonus?: number;
  damage?: string;
}

export interface Monster {
  name: string;
  size: string;
  type: string;
  alignment: string;
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
  tags: string[];
}

export const MONSTER_TEMPLATE: Monster = {
  name: 'Neues Monster',
  size: 'Mittelgroß',
  type: 'Humanoide',
  alignment: 'Neutral',
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
  tags: [],
};

// --- Encounter ---

export interface EncounterMonster {
  slug: string;
  count: number;
  notes: string;
}

export interface Encounter {
  name: string;
  description: string;
  monsters: EncounterMonster[];
  difficulty: 'leicht' | 'mittel' | 'schwer' | 'tödlich';
  xp_total: number;
  party_size: number;
  party_level: number;
  location: string;
  loot: string;
  tags: string[];
  notes: string;
  status: 'planned' | 'done' | 'skipped';
}
