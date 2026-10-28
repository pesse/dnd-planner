/** Wirkung auf eigene Attributs- und Fertigkeitswürfe. */
import { z } from 'zod';
import { ABILITY_KEYS } from './abilities';
import { saveBonusValueSchema } from './savingThrow';
import { SKILL_NAMES } from './vocabulary';

const scope = {
  abilities: z
    .array(z.enum(ABILITY_KEYS))
    .default([])
    .describe('Würfe auf diese Attribute samt ihren Fertigkeiten („Charisma check").'),
  skills: z.array(z.enum(SKILL_NAMES)).default([]).describe('Nur diese Fertigkeiten („Strength (Athletics) check").'),
};

export const checkEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('bonus'), value: saveBonusValueSchema, ...scope })
    .describe('Zuschlag, der immer zählt (Außerweltlicher Glanz: WEI-Modifikator auf Charismawürfe).'),
  z
    .object({
      kind: z.literal('advantage'),
      ...scope,
      condition: z.string().optional().describe('Die Lage aus dem Regeltext, englisch ("while raging"); fehlt = immer.'),
      conditionDe: z.string().optional().describe('Dieselbe Lage deutsch; so zeigt sie der Bogen.'),
    })
    .describe('Vorteil (Bemerkenswerter Athlet: Athletik).'),
]);
export type CheckEffect = z.infer<typeof checkEffectSchema>;
