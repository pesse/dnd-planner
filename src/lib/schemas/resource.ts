/**
 * Was ein Merkmal oder ein Gegenstand an VORRAT gewährt: Kampfrausch-Einsätze, Zauberpunkte,
 * Tiergestalt-Anwendungen — und Zauberplätze, die sich davon nur in der Form des Maximums
 * unterscheiden.
 */
import { z } from 'zod';
import { amountSchema, levelStepsOf } from './amount';

export const RESOURCE_RECHARGE = ['long-rest', 'short-rest', 'dawn', 'none'] as const;
export type ResourceRecharge = (typeof RESOURCE_RECHARGE)[number];

/**
 * Zeigt auf einen Vorrat — entweder auf den eines Merkmals oder auf einen klassenübergreifenden
 * Pool. `shared` schließt `feature`/`pool` aus: ein geteilter Pool gehört keinem Merkmal.
 */
export const resourceRefSchema = z.object({
  feature: z.string().default('').describe('Merkmals-Key; leer = dasselbe Merkmal.'),
  pool: z.string().default('').describe('Pool-Id innerhalb des Merkmals.'),
  shared: z.string().default('').describe('Stattdessen: Name eines geteilten Pools ("standard", "pact").'),
});
export type ResourceRef = z.infer<typeof resourceRefSchema>;

/** Die zwei Schreibweisen der Platz-Zeile einer Klassentabelle. */
export const slotSourceSchema = z.union([
  z.object({ columns: z.array(z.string()).describe('Je Grad eine Spalte, "1st" … "9th".') }),
  z.object({
    countColumn: z.string().describe('Anzahl der Plätze ("Spell Slots").'),
    levelColumn: z.string().describe('Der eine Grad, den sie haben ("Slot Level").'),
  }),
]);
export type SlotSource = z.infer<typeof slotSourceSchema>;

export const resourceShapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('counter'), max: amountSchema }).describe('Einsätze, als Kästchen.'),
  z.object({ kind: z.literal('points'), max: amountSchema }).describe('Punkte, einzeln ausgebbar.'),
  z.object({
    kind: z.literal('slots'),
    levels: slotSourceSchema,
    combine: z
      .enum(['caster-level', 'highest'])
      .describe("'caster-level' ist die SRD-Mehrklassen-Tabelle, 'highest' die Paktmagie-Regel."),
  }),
]);
export type ResourceShape = z.infer<typeof resourceShapeSchema>;

/** Welcher Würfel ein Einsatz ist — der Bogen druckt ihn neben die Kästchen. */
export const resourceDieSchema = z.union([
  z.object({ column: z.string().describe('Spalte der Klassen-Stufentabelle ("Bardic Die").') }),
  z.object({ byLevel: levelStepsOf(z.string().regex(/^d\d+$/)) }),
]);
export type ResourceDie = z.infer<typeof resourceDieSchema>;

export const resourcePoolSchema = z.object({
  id: z.string().describe('Nur innerhalb des Merkmals eindeutig.'),
  labelDe: z.string().default('').describe('Leer = nameDe des Merkmals.'),
  since: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Vorgabe: min(gainedAt). Nur nötig, wenn EIN Merkmal über mehrere Stufen Verschiedenes gibt.'),
  when: z
    .record(z.string(), z.string())
    .optional()
    .describe('Zweig-Bedingung auf dem grantsChoice.optionList DESSELBEN Merkmals.'),
  recharge: z.enum(RESOURCE_RECHARGE),
  shared: z
    .string()
    .default('')
    .describe('Leer = eigener Vorrat des Merkmals. Gesetzt = alle speisenden Klassen teilen EINEN Pool.'),
  shape: resourceShapeSchema,
  die: resourceDieSchema.optional(),
});
export type ResourcePool = z.infer<typeof resourcePoolSchema>;

/** ADDITIV, nie überschreibend: ein Ersatz von `max` machte den Kampfrausch stufenunabhängig. */
export const resourceModSchema = z.object({
  target: resourceRefSchema,
  addMax: amountSchema.optional(),
  recharge: z
    .enum(RESOURCE_RECHARGE)
    .optional()
    .describe('Kürzere Auffüll-Rast für das Ziel; eine längere als die bestehende bleibt wirkungslos.'),
});
export type ResourceMod = z.infer<typeof resourceModSchema>;

export const resourceGrantSchema = z.object({
  pools: z.array(resourcePoolSchema).default([]),
  mods: z.array(resourceModSchema).default([]),
});
export type ResourceGrant = z.infer<typeof resourceGrantSchema>;
