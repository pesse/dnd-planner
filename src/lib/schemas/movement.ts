/** Bewegungsraten und Sinne, die ein Merkmal dem Charakter selbst gibt — in FUSS wie der Regeltext. */
import { z } from 'zod';

export const SPEED_MODES = ['walk', 'climb', 'swim', 'fly'] as const;
export type SpeedMode = (typeof SPEED_MODES)[number];

export const SENSE_KINDS = ['darkvision', 'blindsight', 'tremorsense', 'truesight'] as const;
export type SenseKind = (typeof SENSE_KINDS)[number];

const situation = {
  condition: z.string().optional().describe('Die Lage aus dem Regeltext, englisch ("while your Rage is active"); fehlt = immer.'),
  conditionDe: z.string().optional().describe('Dieselbe Lage deutsch; so zeigt sie der Bogen.'),
};

export const speedEffectSchema = z.object({
  mode: z.enum(SPEED_MODES),
  feet: z
    .union([z.number().int().positive(), z.enum(['speed', 'double-speed'])])
    .describe('In FUSS; "speed" = so hoch wie deine Bewegungsrate („a Swim Speed equal to your Speed").'),
  bonus: z.boolean().default(false).describe('Erhöht die Rate um `feet`, statt sie festzulegen („Your Speed increases by 10 feet").'),
  hover: z.boolean().default(false).describe('Nur beim Fliegen: du kannst schweben.'),
  ...situation,
});
export type SpeedEffect = z.infer<typeof speedEffectSchema>;

export const senseEffectSchema = z.object({
  sense: z.enum(SENSE_KINDS),
  feet: z.number().int().positive(),
  stacks: z
    .boolean()
    .default(false)
    .describe('Hast du den Sinn schon, steigt seine Reichweite um `feet` („If you already have Darkvision, its range increases by 60 feet").'),
  ...situation,
});
export type SenseEffect = z.infer<typeof senseEffectSchema>;
