/**
 * Wie viel — eine Zählform für jede Menge, die aus Stufe, Attribut oder Klassentabelle folgt.
 * Sie deckt die fünf Regelfälle ab (Tabelle, = Stufe, Attributsmodifikator, Formel, feste Zahl).
 */
import { z } from 'zod';
import { ABILITY_NAMES } from './abilities';

export const amountSchema = z.union([
  z.number().int().min(0).describe('Feste Anzahl.'),
  z.literal('proficiency-bonus'),
  z.object({ column: z.string().describe('Spalte der Klassen-Stufentabelle ("Rages").') }),
  z.object({
    abilityMod: z.enum(ABILITY_NAMES),
    min: z.number().int().min(0).default(1),
  }),
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

export type Amount = z.infer<typeof amountSchema>;
