/**
 * Ein Beitrag eines Merkmals zu einer Aura, die von dir ausgeht und dich und Verbündete darin
 * betrifft. Beiträge mit demselben `aura` bilden EINE Aura (Aura des Schutzes + Tapferkeit + Ausdehnung).
 */
import { z } from 'zod';
import { CONDITION_KEYS, DAMAGE_TYPES } from './vocabulary';
import { saveBonusValueSchema } from './savingThrow';

export const auraEffectSchema = z.object({
  aura: z.string().min(1).describe('Key des Merkmals, das die Aura erzeugt ("srd-2024_paladin_aura-of-protection").'),
  radiusFeet: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Ausströmung in FUSS; unter mehreren Beiträgen gilt der größte (Aura-Ausdehnung).'),
  savingThrows: saveBonusValueSchema
    .optional()
    .describe('Bonus auf alle Rettungswürfe für dich und Verbündete in der Aura.'),
  resistances: z
    .array(z.enum(DAMAGE_TYPES))
    .default([])
    .describe('Schadensresistenzen für dich und Verbündete in der Aura.'),
  conditionImmunities: z
    .array(z.enum(CONDITION_KEYS))
    .default([])
    .describe('Zustände, gegen die du und Verbündete in der Aura immun seid.'),
  effect: z.string().optional().describe('Weitere Wirkung in der Aura, englisch, wo die Felder sie nicht fassen.'),
  effectDe: z.string().optional().describe('Dieselbe Wirkung deutsch; so zeigt sie der Bogen.'),
});
export type AuraEffect = z.infer<typeof auraEffectSchema>;
