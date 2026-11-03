/**
 * Eine Falle aus einer Fallen-Bibliothek (DMG oder eigenes Material), zweisprachig wie Regeln.
 * Die Zahlen, mit denen die Kampfkarte würfelt, stehen strukturiert neben dem Fließtext.
 */
import { z } from 'zod';
import { ABILITY_KEYS } from './abilities';
import { sourceField } from './source';
import { DAMAGE_TYPES, SKILL_NAMES } from './vocabulary';

export const TRAP_SEVERITIES = { nuisance: 'Ärgernis', deadly: 'Tödlich' } as const;
export type TrapSeverity = keyof typeof TRAP_SEVERITIES;
const TRAP_SEVERITY_KEYS = Object.keys(TRAP_SEVERITIES) as [TrapSeverity, ...TrapSeverity[]];

const trapCheckSchema = z.object({
  skill: z.enum(SKILL_NAMES).optional(),
  ability: z.enum(ABILITY_KEYS).optional().describe('Nur für einen reinen Attributswurf ohne Fertigkeit.'),
  dc: z.number().int(),
  note: z.string().optional().describe('Woran der Wurf geht, englisch ("the pressure plate").'),
  noteDe: z.string().optional(),
});
export type TrapCheck = z.infer<typeof trapCheckSchema>;

const trapDamageSchema = z.object({
  dice: z.string().describe('Würfelausdruck, z. B. "2d10".'),
  type: z.enum(DAMAGE_TYPES),
});
export type TrapDamage = z.infer<typeof trapDamageSchema>;

const trapTierSchema = z.object({
  levels: z.string().describe('Stufenbereich, z. B. "5–10".'),
  saveDc: z.number().int().optional(),
  damage: z.array(trapDamageSchema).default([]),
  note: z.string().optional().describe('Was sich sonst ändert, englisch ("30-foot cone").'),
  noteDe: z.string().optional(),
});
export type TrapTier = z.infer<typeof trapTierSchema>;

export const trapSchema = z.object({
  key: z.string().describe('{source}_{slug(name)}, z.B. "srd-2024_hidden-pit".'),
  source: sourceField(),
  name: z.string(),
  nameDe: z.string().optional(),
  severity: z.enum(TRAP_SEVERITY_KEYS).default('nuisance'),
  levels: z.string().default('').describe('Stufenbereich der Grundwerte, z. B. "1–4".'),
  trigger: z.string().default(''),
  triggerDe: z.string().optional(),
  desc: z.string().default('').describe('Wirkung, Dauer und Gegenmaßnahmen als Markdown.'),
  descDe: z.string().optional(),
  detect: z.array(trapCheckSchema).default([]),
  disarm: z.array(trapCheckSchema).default([]),
  save: z.object({ ability: z.enum(ABILITY_KEYS), dc: z.number().int() }).optional(),
  damage: z.array(trapDamageSchema).default([]),
  tiers: z.array(trapTierSchema).default([]).describe('Höhere Stufen: ersetzen Rettungswurf-SG und Schaden der Grundwerte.'),
});

export type Trap = z.infer<typeof trapSchema>;
