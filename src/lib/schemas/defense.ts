/** Resistenzen und Immunitäten, die ein Merkmal dem Charakter selbst gibt. */
import { z } from 'zod';
import { CONDITION_KEYS, DAMAGE_TYPES } from './vocabulary';

export const defenseEffectSchema = z.object({
  resistances: z.array(z.enum(DAMAGE_TYPES)).default([]).describe('Schadensresistenzen.'),
  immunities: z.array(z.enum(DAMAGE_TYPES)).default([]).describe('Schadensimmunitäten.'),
  conditionImmunities: z.array(z.enum(CONDITION_KEYS)).default([]).describe('Zustandsimmunitäten.'),
  condition: z
    .string()
    .optional()
    .describe('Die Lage aus dem Regeltext, englisch ("while your Rage is active"); fehlt = immer.'),
  conditionDe: z.string().optional().describe('Dieselbe Lage deutsch („solange dein Kampfrausch aktiv ist"); so zeigt sie der Bogen.'),
});
export type DefenseEffect = z.infer<typeof defenseEffectSchema>;
