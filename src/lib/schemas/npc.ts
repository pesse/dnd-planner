/** Single Source of Truth für NPCs; Anzeige-Labels bleiben in der Karte. */
import { z } from 'zod';
import { abilityStatsSchema } from './abilities';

export const NPC_STATUS = ['lebendig', 'tot', 'vermisst', 'unbekannt'] as const;
export type NpcStatus = (typeof NPC_STATUS)[number];

const npcSkillSchema = z.object({
  bonus: z.number().int().default(0),
  prof: z.boolean().default(false),
});

const npcSpellSchema = z.object({
  name: z.string(),
  level: z.number().int().default(1).describe('0 = Zaubertrick'),
});

export const npcSchema = z.object({
  name: z.string().default(''),
  role: z.string().default(''),
  status: z.enum(NPC_STATUS).default('lebendig'),
  appearance: z.string().default(''),
  personality: z.string().default(''),
  motivation: z.string().default(''),
  secret: z.string().default(''),
  notes: z.string().default(''),
  ac: z.number().int().default(10),
  hp: z.string().default('').describe('z.B. "27 (5W8+5)"'),
  speed: z.string().default('').describe('z.B. "9 m"'),
  stats: abilityStatsSchema,
  savingThrows: z.record(z.string(), npcSkillSchema).default({}),
  skills: z.record(z.string(), npcSkillSchema).default({}),
  spells: z.array(npcSpellSchema).default([]),
  inventory: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type Npc = z.infer<typeof npcSchema>;
export type NpcStats = Npc['stats'];
export type NpcSkill = z.infer<typeof npcSkillSchema>;
export type NpcSpell = z.infer<typeof npcSpellSchema>;

function migrateBonusMap(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [key, entry] of Object.entries(out)) {
    if (typeof entry === 'string') out[key] = { bonus: parseInt(entry) || 0, prof: false };
  }
  return out;
}

/** Idempotent; ein unbekannter Status fällt auf den Default zurück. */
export function migrateNpcLegacy(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const npc = { ...(raw as Record<string, unknown>) };
  npc.skills = migrateBonusMap(npc.skills);
  npc.savingThrows = migrateBonusMap(npc.savingThrows);
  if (Array.isArray(npc.spells)) {
    npc.spells = npc.spells.map((s) => (typeof s === 'string' ? { name: s, level: 1 } : s));
  }
  if (npc.status !== undefined && !NPC_STATUS.includes(npc.status as NpcStatus)) delete npc.status;
  return npc;
}
