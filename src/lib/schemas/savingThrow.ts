/** Wirkung auf Rettungswürfe — dieselbe Form an Gegenständen, an Merkmals-`grants` und an Auren. */
import { z } from 'zod';
import { ABILITY_KEYS } from './abilities';
import { abilityModTermSchema } from './amount';
import { situationalBonusSchema } from './situationalBonus';

/** Nur Formen ohne Stufe: ein Merkmal kennt an dieser Senke seine Klassenstufe nicht. */
export const saveBonusValueSchema = z.union([
  z.number().int().describe('Feste Zahl (Mantel des Schutzes +1).'),
  z.literal('proficiency-bonus'),
  abilityModTermSchema.describe('Attributsmodifikator mit Untergrenze (Aura des Schutzes: CHA, mindestens +1).'),
]);
export type SaveBonusValue = z.infer<typeof saveBonusValueSchema>;

const abilities = {
  abilities: z
    .array(z.enum(ABILITY_KEYS))
    .default([])
    .describe('Nur Rettungswürfe auf diese Attribute; leer = alle.'),
};

export const savingThrowEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('bonus'), value: saveBonusValueSchema, ...abilities })
    .describe('Zuschlag, der immer zählt (Ring des Schutzes +1 auf alle Rettungswürfe).'),
  z
    .object({ kind: z.literal('situational'), ...situationalBonusSchema.shape, ...abilities })
    .describe('Zuschlag nur in einer Lage, die die App nicht kennt.'),
  z
    .object({
      kind: z.literal('advantage'),
      ...abilities,
      deathSave: z.boolean().optional().describe('Gilt für Todesrettungswürfe statt für die Attributs-Rettungswürfe (Widerstandsfähig).'),
      condition: z.string().optional().describe('Die Lage aus dem Regeltext, englisch ("against spells"); fehlt = immer.'),
      conditionDe: z.string().optional().describe('Dieselbe Lage deutsch; so zeigt sie der Bogen.'),
    })
    .describe('Vorteil auf Rettungswürfe (Gnomische Gerissenheit: INT, WEI, CHA).'),
]);
export type SavingThrowEffect = z.infer<typeof savingThrowEffectSchema>;
