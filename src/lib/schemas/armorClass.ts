/** Wirkung auf die Rüstungsklasse — dieselbe Form an Gegenständen und an Merkmals-`grants`. */
import { z } from 'zod';
import { ABILITY_KEYS } from './abilities';
import { situationalBonusSchema } from './situationalBonus';

export const ARMOR_CLASS_CONDITIONS = ['always', 'armored', 'unarmored', 'unarmoredNoShield'] as const;
export type ArmorClassCondition = (typeof ARMOR_CLASS_CONDITIONS)[number];

export const armorClassEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('unarmored'),
      base: z.number().int().default(10),
      abilities: z.array(z.enum(ABILITY_KEYS)).describe('Deren Mods kommen zur Basis, GES eingeschlossen ("dex").'),
      shield: z.boolean().default(true).describe('false = gilt nur ohne Schild (Mönch).'),
    })
    .describe('Alternative Basis ohne Rüstung („10 plus GES- und KON-Mod"); die beste verfügbare Basis zählt.'),
  z
    .object({
      kind: z.literal('bonus'),
      value: z.number().int(),
      when: z
        .enum(ARMOR_CLASS_CONDITIONS)
        .default('always')
        .describe('armored = nur in leichter, mittlerer oder schwerer Rüstung (Kampfstil Verteidigung).'),
    })
    .describe('Zuschlag auf die RK (Ring des Schutzes +1).'),
  z
    .object({ kind: z.literal('situational'), ...situationalBonusSchema.shape })
    .describe('Zuschlag nur in einer Lage (Pfeilfangschild +2 gegen Fernkampfangriffe).'),
]);
export type ArmorClassEffect = z.infer<typeof armorClassEffectSchema>;
