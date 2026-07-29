/**
 * Ergebnis-Schema der thinking-freien Ausrüstungs-Aufbereitung im Erstell-Wizard:
 * die englische Startausrüstungs-Prosa (Klasse + Hintergrund) wird in WÄHLBARE,
 * deutsche Optionen zerlegt — je Herkunft eine Gruppe, je Gruppe eine oder mehrere
 * Optionen (A/B/C). Der Nutzer wählt pro Gruppe genau eine Option; die Gegenstände
 * sind schon konkret benannt und (wo möglich) an Bibliotheks-Items angelehnt.
 * Single Source of Truth → Typ + LLM-JSON-Schema.
 *
 * Bewusst OHNE Gewicht: das füllt die Assembly deterministisch aus der Item-
 * Bibliothek (wie das Autocomplete im Charakter-Editor), nicht das Modell.
 */
import { z } from 'zod';
import { toLlmJsonSchema } from './shared';

const equipmentItemSchema = z.object({
  name: z.string().describe('Deutscher Item-Name, möglichst wörtlich aus <library_items>.'),
  count: z.number().int().min(1).default(1).describe('Stückzahl.'),
});

const equipmentOptionSchema = z.object({
  label: z.string().default('').describe('Kurzes deutsches Etikett der Option — der Buchstabe ("A"/"B"/"C"), wenn der Text einen nennt, sonst ein knappes Substantiv.'),
  description: z
    .string()
    .default('')
    .describe('Deutsche Beschreibung dieser Option in einem knappen Satz (alle Gegenstände + Gold), für den Nutzer zum Lesen.'),
  items: z.array(equipmentItemSchema).default([]).describe('Konkrete Gegenstände dieser Option.'),
  goldPieces: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Gold dieser Option in Goldmünzen (GM); sonst 0.'),
});

const equipmentGroupSchema = z.object({
  source: z.string().default('').describe('Deutsche Herkunft der Wahl: "Klasse" oder "Hintergrund".'),
  options: z
    .array(equipmentOptionSchema)
    .default([])
    .describe('Wählbare Optionen; genau eine wird gewählt. Fixe Ausrüstung ohne Wahl → genau eine Option.'),
});

export const equipmentOptionsSchema = z.object({
  groups: z.array(equipmentGroupSchema).default([]).describe('Wahlgruppen, je Herkunft eine.'),
});

export type EquipmentItem = z.infer<typeof equipmentItemSchema>;
export type EquipmentOption = z.infer<typeof equipmentOptionSchema>;
export type EquipmentGroup = z.infer<typeof equipmentGroupSchema>;
export type EquipmentOptions = z.infer<typeof equipmentOptionsSchema>;

export const equipmentOptionsJsonSchema = toLlmJsonSchema(equipmentOptionsSchema);

/** Nachsichtiger Parser (füllt Defaults, strippt Unbekanntes); null bei Schema-Bruch. */
export function parseEquipmentOptions(raw: unknown): EquipmentOptions | null {
  const r = equipmentOptionsSchema.safeParse(raw);
  return r.success ? r.data : null;
}
