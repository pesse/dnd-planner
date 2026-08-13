/**
 * Single Source of Truth für Monster; Label-Maps und Helfer bleiben in `types.ts`.
 * Feldnamen und Struktur folgen Open5e v2 `/v2/creatures/`, damit der Import ein
 * Umbenennen bleibt. Reichweiten stehen in FUSS — umgerechnet wird erst in der Anzeige.
 */
import { z } from 'zod';
import {
  CONDITION_KEYS,
  DAMAGE_DICE,
  DAMAGE_TYPES,
  MONSTER_SIZES,
  MONSTER_TYPES,
  MONSTER_ALIGNMENTS,
  SKILL_NAMES,
  type MonsterSize,
  type MonsterType,
  type MonsterAlignment,
} from './vocabulary';
import { ABILITY_KEYS, abilityStatsSchema } from './abilities';
import { sourceField, migrateSourceLegacy } from './source';
import { upgradeLegacyMonster } from './monsterLegacy';

const sizeEnum = z.enum(Object.keys(MONSTER_SIZES) as [MonsterSize, ...MonsterSize[]]);
const typeEnum = z.enum(Object.keys(MONSTER_TYPES) as [MonsterType, ...MonsterType[]]);
const alignmentEnum = z.enum(Object.keys(MONSTER_ALIGNMENTS) as [MonsterAlignment, ...MonsterAlignment[]]);

/**
 * Open5e führt Grund- und Zusatzschaden als acht flache Felder (`damage_die_count`,
 * `extra_damage_die_count`, …). Ein Objekt, zweimal verwendet, halbiert das und lässt den
 * Statblock über beide Würfe laufen statt sie einzeln zu formatieren.
 */
const damageRollSchema = z.object({
  die_count: z.number().int().default(0),
  die_type: z.enum(DAMAGE_DICE).optional(),
  bonus: z.number().int().default(0),
  type: z.enum(DAMAGE_TYPES).optional(),
});

const attackSchema = z.object({
  name: z.string(),
  attack_type: z.enum(['WEAPON', 'SPELL']).default('WEAPON'),
  to_hit_mod: z.number().int().default(0),
  reach: z.number().int().optional().describe('Nahkampfreichweite in Fuß'),
  range: z.number().int().optional().describe('Normale Fernkampfreichweite in Fuß'),
  long_range: z.number().int().optional(),
  target_creature_only: z.boolean().default(false),
  damage: damageRollSchema.optional(),
  extra_damage: damageRollSchema.optional(),
});

/** Die Aufladung einer Aktion: `RECHARGE_ON_ROLL` mit `param: 5` heißt „Aufladung 5–6". */
const usageLimitsSchema = z.object({
  type: z.enum(['PER_DAY', 'RECHARGE', 'RECHARGE_ON_ROLL']),
  param: z.number().int().default(0),
});

/** Angezeigt wird `name`/`desc`; `*_en` hält das Original, an dem der Re-Import wiedererkennt. */
const traitSchema = z.object({
  name: z.string(),
  name_en: z.string().default(''),
  desc: z.string().default(''),
  desc_en: z.string().default(''),
});

/** In gedruckter Reihenfolge — `actionGroups` und der Open5e-Mapper sortieren danach. */
export const MONSTER_ACTION_TYPES = ['ACTION', 'BONUS_ACTION', 'REACTION', 'LEGENDARY_ACTION'] as const;

const actionSchema = traitSchema.extend({
  action_type: z.enum(MONSTER_ACTION_TYPES).default('ACTION'),
  legendary_action_cost: z.number().int().default(1),
  usage_limits: usageLimitsSchema.optional(),
  attacks: z.array(attackSchema).default([]),
});

const speedSchema = z
  .object({
    walk: z.number().int().default(0),
    fly: z.number().int().default(0),
    swim: z.number().int().default(0),
    climb: z.number().int().default(0),
    burrow: z.number().int().default(0),
    hover: z.boolean().default(false),
  })
  .default({ walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false })
  .describe('Bewegungsraten in Fuß');

const sensesSchema = z
  .object({
    darkvision: z.number().int().default(0),
    blindsight: z.number().int().default(0),
    tremorsense: z.number().int().default(0),
    truesight: z.number().int().default(0),
  })
  .default({ darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 })
  .describe('Sinnesreichweiten in Fuß; 0 = nicht vorhanden');

export const monsterSchema = z.object({
  key: z.string().optional().describe('Open5e-v2-Key, z.B. "srd-2024_goblin-warrior".'),
  source: sourceField(),
  name: z.string().describe('Angezeigter Name, deutsch sofern übersetzt.'),
  name_en: z.string().default('').describe('Englischer Originalname; Match-Schlüssel des Re-Imports.'),
  size: sizeEnum.default('Medium').describe('Tiny | Small | Medium | Large | Huge | Gargantuan'),
  type: typeEnum.default('humanoid').describe('engl. Creature-Type: beast, humanoid, dragon, giant, undead, …'),
  alignment: alignmentEnum.default('neutral').describe('engl. Gesinnung, z.B. "chaotic evil"'),
  challenge_rating: z.number().default(0.25).describe('Herausforderungsgrad als Zahl: 0.125, 0.25, 0.5, 1 … 30'),
  xp: z.number().int().default(0),
  armor_class: z.number().int().default(10),
  armor_detail: z.string().default('').describe('z.B. "natural armor", "Kettenhemd, Schild"'),
  hit_points: z.number().int().default(0),
  hit_dice: z.string().default('').describe('z.B. "2d8 + 2"'),
  ability_scores: abilityStatsSchema,
  saving_throws: z
    .partialRecord(z.enum(ABILITY_KEYS), z.number().int())
    .default({})
    .describe('Nur geübte Rettungswürfe, z.B. {"con": 4}'),
  skill_bonuses: z
    .partialRecord(z.enum(SKILL_NAMES), z.number().int())
    .default({})
    .describe('Nur geübte Fertigkeiten, englische SRD-Namen, z.B. {"Stealth": 6}'),
  speed: speedSchema,
  senses: sensesSchema,
  languages: z.array(z.string()).default([]).describe('Deutsche Sprachnamen, Freitext.'),
  languages_desc: z.string().default('').describe('Zusatz wie "Telepathie 120 Fuß" oder "versteht alle, spricht nicht".'),
  damage_resistances: z.array(z.enum(DAMAGE_TYPES)).default([]),
  damage_immunities: z.array(z.enum(DAMAGE_TYPES)).default([]),
  damage_vulnerabilities: z.array(z.enum(DAMAGE_TYPES)).default([]),
  condition_immunities: z.array(z.enum(CONDITION_KEYS)).default([]),
  defenses_desc: z.string().default('').describe('Einschränkungen, die keine Liste fasst, z.B. "nicht-magische Waffen".'),
  traits: z.array(traitSchema).default([]),
  actions: z.array(actionSchema).default([]),
  tags: z.array(z.string()).default([]).describe('Freie Marker der Spielleitung, z.B. ["tunnel"].'),
});

export type Monster = z.infer<typeof monsterSchema>;
export type MonsterAction = z.infer<typeof actionSchema>;
export type MonsterTrait = z.infer<typeof traitSchema>;
export type MonsterAttack = z.infer<typeof attackSchema>;
export type MonsterDamageRoll = z.infer<typeof damageRollSchema>;
export type MonsterSpeed = z.infer<typeof speedSchema>;
export type MonsterSenses = z.infer<typeof sensesSchema>;
export type MonsterUsageLimits = z.infer<typeof usageLimitsSchema>;

/** Bestandsdateien im Vor-Open5e-Format anheben. Idempotent, siehe `monsterLegacy.ts`. */
export function migrateMonsterLegacy(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return migrateSourceLegacy(upgradeLegacyMonster(raw as Record<string, unknown>));
}
