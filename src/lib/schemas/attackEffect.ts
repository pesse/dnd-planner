/** Wirkung auf Angriffs- und Schadenswürfe — dieselbe Form an Gegenständen und an Merkmals-`grants`. */
import { z } from 'zod';
import { situationalBonusSchema } from './situationalBonus';
import { levelStepsOf } from './amount';
import { DAMAGE_TYPES, WEAPON_PROPERTIES } from './vocabulary';

export const ATTACK_WEAPON_RANGES = ['any', 'melee', 'ranged'] as const;
export type AttackWeaponRange = (typeof ATTACK_WEAPON_RANGES)[number];

const weaponFilter = {
  range: z.enum(ATTACK_WEAPON_RANGES).default('any').describe('melee/ranged nach `weapon_range` der verknüpften Waffe.'),
  weapons: z
    .array(z.string())
    .optional()
    .describe('Nur diese Waffenarten als Item-`index` ("longbow"); ein magisches Stück zählt über seine Grundwaffe.'),
  properties: z
    .array(z.enum(WEAPON_PROPERTIES))
    .optional()
    .describe('Nur Waffen mit mindestens einer dieser Eigenschaften ("heavy", "versatile").'),
  damageTypes: z
    .array(z.enum(DAMAGE_TYPES))
    .optional()
    .describe('Nur Waffen, deren Schaden eine dieser Arten hat (Durchbohrer: "piercing").'),
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
      value: z.union([z.number().int(), z.literal('proficiency-bonus')]).describe('Zahl oder der Übungsbonus (Meister der Großwaffen).'),
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
  z
    .object({
      kind: z.literal('note'),
      condition: situationalBonusSchema.shape.condition,
      conditionDe: situationalBonusSchema.shape.conditionDe,
      ...weaponFilter,
    })
    .describe('Wirkung ohne Zahl, die der Angriff nennen soll (Schlagende Wurzeln: Reichweite +3 m in deinem Zug).'),
]);
export type AttackEffect = z.infer<typeof attackEffectSchema>;
