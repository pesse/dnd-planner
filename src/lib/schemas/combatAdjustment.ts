/**
 * Handeingetragene Abweichungen der gerechneten Kampfwerte. Die Form folgt
 * `resourceAdjustmentSchema`; jede Anpassung steht als eigener Posten in der Herleitung.
 */
import { z } from 'zod';

export const COMBAT_STATS = ['ac', 'hpMax', 'initiative', 'speed', 'proficiencyBonus'] as const;
export type CombatStat = (typeof COMBAT_STATS)[number];

export const combatAdjustmentSchema = z.object({
  amount: z.number().int().describe('Zu- oder Abschlag; bei der Bewegungsrate in Fuß.'),
  reason: z.string().default('').describe('Anlass, z. B. "Segen des Spielleiters".'),
});
export type CombatAdjustment = z.infer<typeof combatAdjustmentSchema>;

export const combatAdjustmentsSchema = z.object({
  ac: z.array(combatAdjustmentSchema).default([]),
  hpMax: z.array(combatAdjustmentSchema).default([]),
  initiative: z.array(combatAdjustmentSchema).default([]),
  speed: z.array(combatAdjustmentSchema).default([]),
  proficiencyBonus: z.array(combatAdjustmentSchema).default([]),
});
export type CombatAdjustments = z.infer<typeof combatAdjustmentsSchema>;

export const emptyCombatAdjustments = (): CombatAdjustments => ({ ac: [], hpMax: [], initiative: [], speed: [], proficiencyBonus: [] });

export const adjustmentSum = (list: readonly CombatAdjustment[] | undefined): number =>
  (list ?? []).reduce((n, a) => n + a.amount, 0);
