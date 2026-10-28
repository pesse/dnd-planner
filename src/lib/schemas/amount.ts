/**
 * Wie viel — eine Zählform für jede Menge, die aus Stufe, Attribut oder Klassentabelle folgt.
 * Sie deckt die Regelfälle ab (Tabelle, = Stufe, Attributsmodifikator, Formel, Stufensprung, feste Zahl, Summe).
 */
import { z } from 'zod';
import { ABILITY_NAMES } from './abilities';

/** Ab welcher Stufe welcher Wert gilt; der höchste erreichte Schlüssel gewinnt, darunter keiner. */
export const levelStepsOf = <T extends z.ZodTypeAny>(value: T) =>
  z
    .record(z.string().regex(/^\d+$/), value)
    .describe('Stufe → Wert ab dieser Stufe, z.B. {"2": 1, "17": 2}.');

export const abilityModTermSchema = z.object({
  abilityMod: z.enum(ABILITY_NAMES),
  min: z.number().int().min(0).default(1),
});

const termSchema = z.union([
  z.number().int().min(0).describe('Feste Anzahl.'),
  z.literal('proficiency-bonus'),
  z.object({ column: z.string().describe('Spalte der Klassen-Stufentabelle ("Rages").') }),
  z.object({ byLevel: levelStepsOf(z.number().int().min(0)) }),
  abilityModTermSchema,
  // `base` ist PFLICHT, obwohl 0 sinnvoll wäre: mit Vorgabe träfe diese Variante auch `{}` und
  // schluckte jeden Tippfehler als 0.
  z
    .object({
      base: z.number().int().min(0),
      perLevel: z.number().int().min(0).default(0),
      divide: z.number().int().min(1).default(1),
      round: z.enum(['down', 'up']).default('down'),
    })
    .describe('Formel: (base + perLevel × (Stufe − 1)) ÷ divide, gerundet.'),
]);

// Die Summanden sind einfache Formen statt wieder `amountSchema`: rekursiv ließe sich das
// JSON-Schema fürs LLM nicht mehr flach erzeugen.
export const amountSchema = z.union([
  ...termSchema.options,
  z
    .object({ sum: z.array(termSchema).min(2) })
    .describe('Summe, z.B. doppelte Stufe plus Intelligenzmodifikator.'),
]);

export type Amount = z.infer<typeof amountSchema>;
export type AmountTerm = z.infer<typeof termSchema>;
