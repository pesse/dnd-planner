/**
 * Single Source of Truth für Monster: Zod-Schema → TS-Type + Runtime-Validator +
 * LLM-JSON-Schema (siehe llmJson.ts). Label-Maps/Helper bleiben in types.ts.
 */
import { z } from 'zod';
import {
  MONSTER_SIZES,
  MONSTER_TYPES,
  MONSTER_ALIGNMENTS,
  type MonsterSize,
  type MonsterType,
  type MonsterAlignment,
} from './vocabulary';
import { sourceField, migrateSourceLegacy } from './source';

const sizeEnum = z.enum(Object.keys(MONSTER_SIZES) as [MonsterSize, ...MonsterSize[]]);
const typeEnum = z.enum(Object.keys(MONSTER_TYPES) as [MonsterType, ...MonsterType[]]);
const alignmentEnum = z.enum(Object.keys(MONSTER_ALIGNMENTS) as [MonsterAlignment, ...MonsterAlignment[]]);

const damageSchema = z.object({
  dice: z.string().describe('z.B. "2d6+3"'),
  type: z.string().describe('Schadensart (deutsch), z.B. "Feuer"'),
});

const actionSchema = z.object({
  name: z.string(),
  description: z.string(),
  attack_bonus: z.number().int().optional(),
  damage: z.array(damageSchema).optional(),
});

const actionArray = z.array(actionSchema).default([]);

export const monsterSchema = z.object({
  index: z.string().optional().describe('API-Slug (leer bei Homebrew).'),
  source: sourceField(),
  name: z.string(),
  size: sizeEnum.default('Medium').describe('Tiny | Small | Medium | Large | Huge | Gargantuan'),
  type: typeEnum.default('humanoid').describe('engl. Creature-Type: beast, humanoid, dragon, giant, undead, …'),
  alignment: alignmentEnum.default('neutral').describe('engl. Gesinnung, z.B. "chaotic evil"'),
  ac: z
    .object({ value: z.number().int(), note: z.string().default('') })
    .default({ value: 10, note: '' }),
  hp: z
    .object({ average: z.number().int(), formula: z.string().default('').describe('z.B. "2d8+2"') })
    .default({ average: 0, formula: '' }),
  speed: z.string().default('').describe('z.B. "9 m", ggf. mit Flug/Schwimmen'),
  stats: z
    .object({
      str: z.number().int(),
      dex: z.number().int(),
      con: z.number().int(),
      int: z.number().int(),
      wis: z.number().int(),
      cha: z.number().int(),
    })
    .default({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
  saving_throws: z.record(z.string(), z.string()).default({}).describe('z.B. {"con":"+4"}'),
  skills: z.record(z.string(), z.string()).default({}).describe('z.B. {"Heimlichkeit":"+6"}'),
  damage_resistances: z.array(z.string()).default([]),
  damage_immunities: z.array(z.string()).default([]),
  condition_immunities: z.array(z.string()).default([]),
  senses: z.string().default(''),
  languages: z.string().default(''),
  cr: z.string().default('1/4').describe('Herausforderungsgrad, z.B. "1/4", "5"'),
  xp: z.number().int().default(0),
  traits: actionArray,
  actions: actionArray,
  reactions: actionArray,
  legendary_actions: actionArray,
});

export type Monster = z.infer<typeof monsterSchema>;
export type MonsterAction = z.infer<typeof actionSchema>;
export type MonsterDamage = z.infer<typeof damageSchema>;

/** Migriert alte String-Schadensfelder in Aktionen zu MonsterDamage[]. Idempotent. */
export function migrateMonsterLegacy(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const m = { ...(raw as Record<string, unknown>) };
  for (const key of ['traits', 'actions', 'reactions', 'legendary_actions']) {
    const arr = m[key];
    if (!Array.isArray(arr)) continue;
    for (const a of arr) {
      if (a && typeof a === 'object' && typeof (a as Record<string, unknown>).damage === 'string') {
        const s = (a as Record<string, unknown>).damage as string;
        const last = s.lastIndexOf(' ');
        (a as Record<string, unknown>).damage =
          last === -1 ? [{ dice: s, type: '' }] : [{ dice: s.slice(0, last), type: s.slice(last + 1) }];
      }
    }
  }
  return migrateSourceLegacy(m);
}
