/**
 * Zweisprachiges Spezies-Bibliotheks-Schema — analog zur Klassen-Progression
 * (`classProgression.ts`), aber ohne Stufen-Konzept.
 *
 * Ein dünner Adapter über das Open5e-**v2**-Format (`/v2/species/{key}`): die
 * Merkmale (`traits`) tragen — wie bei Zaubern/Gegenständen — je einen englischen
 * (`name`/`desc`) und einen optionalen deutschen (`nameDe`/`descDe`) Wert. Das
 * Deutsche wird per LLM-Übersetzung nachgefüllt; Open5e liefert nur Englisch.
 */
import { z } from 'zod';

/** Ein Speziesmerkmal (Trait); zweisprachig (EN Pflicht, DE optional). */
export const traitSchema = z.object({
  key: z.string().default(''),
  name: z.string(),
  nameDe: z.string().optional(),
  desc: z.string().default(''),
  descDe: z.string().optional(),
});

export const speciesSchema = z.object({
  key: z.string(),
  name: z.string(),
  nameDe: z.string().optional(),
  size: z.string().default(''),
  speed: z.string().default(''),
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
  traits: z.array(traitSchema).default([]),
});

export type Trait = z.infer<typeof traitSchema>;
export type Species = z.infer<typeof speciesSchema>;
