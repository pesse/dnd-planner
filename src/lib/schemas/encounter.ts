/**
 * Single Source of Truth für Encounter. Monster stehen NUR als `slug` darin; die
 * Statblöcke liegen als eigene Dateien und werden beim Anzeigen aufgelöst
 * (`contextLoad.ts:fetchEncounterMonsters`).
 */
import { z } from 'zod';

export const ENCOUNTER_DIFFICULTIES = ['leicht', 'mittel', 'schwer', 'tödlich'] as const;
export const ENCOUNTER_STATUSES = ['planned', 'done', 'skipped'] as const;

const encounterMonsterSchema = z.object({
  slug: z.string().describe('Dateiname des Monsters ohne .json (kebab-case).'),
  count: z.number().int().default(1),
  notes: z.string().default('').describe('Taktik/Hinweise zu diesem Monster im Encounter.'),
});

export const encounterSchema = z.object({
  name: z.string(),
  description: z.string().default('').describe('Worum geht es im Encounter (deutsch).'),
  read_aloud: z
    .string()
    .default('')
    .describe('Optionaler Vorlesetext für die Spielleitung; "" wenn nicht zutreffend.'),
  monsters: z.array(encounterMonsterSchema).default([]),
  difficulty: z.enum(ENCOUNTER_DIFFICULTIES).default('mittel'),
  xp_total: z.number().int().default(0),
  party_size: z.number().int().default(4),
  party_level: z.number().int().default(1),
  location: z.string().default(''),
  loot: z.string().default('').describe('Beute/Belohnungen als Fließtext.'),
  notes: z.string().default('').describe('Spielleiter-Notizen, PC-Integration, Konsequenzen.'),
  status: z.enum(ENCOUNTER_STATUSES).default('planned'),
});

export type Encounter = z.infer<typeof encounterSchema>;
export type EncounterMonster = z.infer<typeof encounterMonsterSchema>;

/** Idempotent. */
export function migrateEncounterLegacy(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const e = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(e.loot)) e.loot = (e.loot as unknown[]).map(String).join('; ');
  return e;
}
