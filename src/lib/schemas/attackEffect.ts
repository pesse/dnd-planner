/** Wirkung auf Angriffs- und Schadenswürfe — dieselbe Form an Gegenständen und an Merkmals-`grants`. */
import { z } from 'zod';
import { situationalBonusSchema } from './situationalBonus';
import { levelStepsOf } from './amount';
import { DAMAGE_TYPES } from './vocabulary';

export const ATTACK_WEAPON_RANGES = ['any', 'melee', 'ranged'] as const;
export type AttackWeaponRange = (typeof ATTACK_WEAPON_RANGES)[number];

const weaponFilter = {
  range: z.enum(ATTACK_WEAPON_RANGES).default('any').describe('melee/ranged nach `weapon_range` der verknüpften Waffe.'),
  weapons: z
    .array(z.string())
    .optional()
    .describe('Nur diese Waffenarten als Item-`index` ("longbow"); ein magisches Stück zählt über seine Grundwaffe.'),
};

const diceSchema = z.string().regex(/^\d+d\d+$/).describe('Würfel wie "1d4"; `byLevel` nach Klassenstufe, bei Trait und Talent nach Charakterstufe.');

export const attackEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('bonus'),
      attack: z.number().int().default(0),
      damage: z.number().int().default(0),
      ...weaponFilter,
    })
    .describe('Fester Zuschlag (Kampfstil Bogenschießen +2 Angriff mit Fernkampfwaffen).'),
  z
    .object({
      kind: z.literal('situational'),
      roll: z.enum(['attack', 'damage']),
      ...situationalBonusSchema.shape,
      ...weaponFilter,
    })
    .describe('Zuschlag nur in einer Lage, die die App nicht kennt (Duellieren: +2 Schaden ohne zweite Waffe).'),
  z
    .object({
      kind: z.literal('dice'),
      dice: z.union([diceSchema, z.object({ byLevel: levelStepsOf(diceSchema) })]),
      damageType: z.enum(DAMAGE_TYPES).optional(),
      condition: situationalBonusSchema.shape.condition,
      conditionDe: situationalBonusSchema.shape.conditionDe,
      ...weaponFilter,
    })
    .describe('Zusätzliche Schadenswürfel, die der Spieler selbst wirft (Schreckliche Schläge: +1W4 psychisch einmal pro Zug).'),
]);
export type AttackEffect = z.infer<typeof attackEffectSchema>;
