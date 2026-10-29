/** Resistenzen und Immunitäten, die ein Merkmal dem Charakter selbst gibt. */
import { z } from 'zod';
import { CONDITION_KEYS, DAMAGE_TYPES } from './vocabulary';

export const defenseEffectSchema = z.object({
  resistances: z.array(z.enum(DAMAGE_TYPES)).default([]).describe('Schadensresistenzen.'),
  immunities: z.array(z.enum(DAMAGE_TYPES)).default([]).describe('Schadensimmunitäten.'),
  conditionImmunities: z.array(z.enum(CONDITION_KEYS)).default([]).describe('Zustandsimmunitäten.'),
  reduction: z
    .object({
      types: z.array(z.enum(DAMAGE_TYPES)).min(1),
      amount: z.union([z.number().int().min(1), z.literal('proficiency-bonus')]),
    })
    .optional()
    .describe('Schaden dieser Arten sinkt um den Betrag (Meister der schweren Rüstung).'),
  condition: z
    .string()
    .optional()
    .describe('Die Lage aus dem Regeltext, englisch ("while your Rage is active"); fehlt = immer.'),
  conditionDe: z.string().optional().describe('Dieselbe Lage deutsch („solange dein Kampfrausch aktiv ist"); so zeigt sie der Bogen.'),
});
export type DefenseEffect = z.infer<typeof defenseEffectSchema>;
