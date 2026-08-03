/**
 * Die Startausrüstungs-Prosa als WÄHLBARE deutsche Optionen: je Herkunft eine Gruppe,
 * je Gruppe wählt der Nutzer genau eine Option. Bewusst OHNE Gewicht — das füllt die
 * Assembly deterministisch aus der Item-Bibliothek, nicht das Modell.
 */
import { z } from 'zod';
import { toLlmJsonSchema } from './llmJson';

/**
 * „Handwerkszeug" steht im SRD für 17 Werkzeuge, „Musikinstrument" für 10 — beides keine
 * Gegenstände der Bibliothek. Das Modell setzt die Kategorie, der Nutzer wählt im Wizard.
 */
export const EQUIPMENT_CHOICE_CATEGORIES = ['artisan-tools', 'instrument'] as const;
export type EquipmentChoiceCategory = (typeof EQUIPMENT_CHOICE_CATEGORIES)[number];

const equipmentItemSchema = z.object({
  name: z.string().describe('Deutscher Item-Name, möglichst wörtlich aus <library_items>.'),
  count: z.number().int().min(1).default(1).describe('Stückzahl.'),
  // Leerstring statt `.optional()`: das LLM-JSON-Schema ist strikt, jedes Feld muss
  // im Output stehen — ein weggelassenes Feld bricht guided decoding.
  choiceFrom: z
    .enum(['', ...EQUIPMENT_CHOICE_CATEGORIES])
    .default('')
    .describe('Nur wenn der Text eine KATEGORIE statt eines Gegenstands nennt: "artisan-tools" für Handwerkszeug, "instrument" für Musikinstrument. Sonst leer.'),
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

export function parseEquipmentOptions(raw: unknown): EquipmentOptions | null {
  const r = equipmentOptionsSchema.safeParse(raw);
  return r.success ? r.data : null;
}
