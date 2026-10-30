/**
 * Was ein Merkmal oder ein Gegenstand an VORRAT gewährt: Kampfrausch-Einsätze, Zaubereipunkte,
 * Tiergestalt-Anwendungen — und Zauberplätze, die sich davon nur in der Form des Maximums
 * unterscheiden.
 */
import { z } from 'zod';
import { amountSchema, levelStepsOf } from './amount';
import { whenSchema } from './when';

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

/** Was einen verbrauchten Einsatz außerhalb der Rast zurückholt; die App nennt es, sie bucht nichts. */
export const resourceRestoreSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('slot'),
    level: z.number().int().min(1).max(9).default(1).describe('Mindestgrad („a level 2+ spell slot").'),
    exactly: z.boolean().default(false).describe('Genau dieser Grad („a level 5 spell slot").'),
    pact: z.boolean().default(false).describe('Nur ein Platz der Paktmagie.'),
  }),
  z.object({
    kind: z.literal('resource'),
    target: resourceRefSchema,
    amount: z.number().int().min(1).default(1).describe('So viele Einsätze oder Punkte des Ziels.'),
  }),
]);
export type ResourceRestore = z.infer<typeof resourceRestoreSchema>;

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
  when: whenSchema.optional(),
  recharge: z.enum(RESOURCE_RECHARGE),
  shortRestRegain: amountSchema
    .optional()
    .describe('Wie viele eine Kurze Rast zurückgibt, wo erst `recharge` alle zurückgibt („You regain one expended use when you finish a Short Rest").'),
  shared: z
    .string()
    .default('')
    .describe('Leer = eigener Vorrat des Merkmals. Gesetzt = alle speisenden Klassen teilen EINEN Pool.'),
  restoreBy: z.array(resourceRestoreSchema).default([]),
  noteDe: z
    .string()
    .optional()
    .describe('Was der Zähler nicht zählt, als Bogentext ("1. Psionisches Flüstern je Lange Rast gratis").'),
  shape: resourceShapeSchema,
  rolled: z
    .string()
    .regex(/^\d*d\d+([+-]\d+)?$/)
    .optional()
    .describe('Nur Gegenstände: das Maximum wird einmal ausgewürfelt („1d8+1") und an der Inventarzeile gespeichert; bis dahin gilt `shape.max`, das höchste Ergebnis.'),
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
  restoreBy: z.array(resourceRestoreSchema).default([]).describe('Weitere Wege, das Ziel zurückzuholen (Wilde Wiederkehr).'),
  noteDe: z
    .string()
    .optional()
    .describe('Was der Zähler nicht zählt, als Bogentext ("1. Psionisches Flüstern je Lange Rast gratis").'),
});
export type ResourceMod = z.infer<typeof resourceModSchema>;

/** Am Charakter statt in der Bibliothek: ein Spielleiter-Segen gehört genau dieser Figur. */
export const resourceAdjustmentSchema = z.object({
  target: resourceRefSchema,
  amount: z.number().int().describe('Zu- oder Abschlag auf das Maximum.'),
  grade: z.number().int().min(1).max(9).optional().describe('Nur bei Zauberplätzen: der betroffene Grad.'),
  reason: z.string().default('').describe('Anlass, z. B. "Segen des Spielleiters"; steht am Vorrat.'),
});
export type ResourceAdjustment = z.infer<typeof resourceAdjustmentSchema>;

export const resourceGrantSchema = z.object({
  pools: z.array(resourcePoolSchema).default([]),
  mods: z.array(resourceModSchema).default([]),
});
export type ResourceGrant = z.infer<typeof resourceGrantSchema>;
