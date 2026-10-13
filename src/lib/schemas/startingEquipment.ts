/**
 * Die Startausrüstung als Deklaration an Klasse und Hintergrund: je Herkunft eine Wahl
 * zwischen Paketen (A/B/C), jedes Paket Bibliotheks-Items per Key plus Gold.
 */
import { z } from 'zod';

/**
 * „Handwerkszeug" steht im SRD für 17 Werkzeuge, „Musikinstrument" für 10 — keine
 * Gegenstände der Bibliothek, der Spieler wählt im Wizard.
 */
export const EQUIPMENT_CHOICE_CATEGORIES = ['artisan-tools', 'instrument', 'gaming-set'] as const;
export type EquipmentChoiceCategory = (typeof EQUIPMENT_CHOICE_CATEGORIES)[number];

export const EQUIPMENT_CHOICE_LABEL: Record<EquipmentChoiceCategory, string> = {
  'artisan-tools': 'Handwerkszeug',
  instrument: 'Musikinstrument',
  'gaming-set': 'Spielset',
};

export const startingItemSchema = z.object({
  itemKey: z.string().default('').describe('Bibliotheks-Key des Gegenstands; leer bei `choiceFrom`.'),
  count: z.number().int().min(1).default(1),
  choiceFrom: z.enum(EQUIPMENT_CHOICE_CATEGORIES).optional()
    .describe('Kategorie statt Gegenstand — der Spieler wählt das konkrete Item.'),
  noteDe: z.string().optional().describe('Zusatz, den das Item nicht trägt, z.B. „(Gebete)" am Buch.'),
});

export const startingEquipmentOptionSchema = z.object({
  label: z.string().describe('Buchstabe der SRD-Option: "A", "B", "C".'),
  items: z.array(startingItemSchema).default([]),
  goldPieces: z.number().int().min(0).default(0),
});

export type StartingItem = z.infer<typeof startingItemSchema>;
export type StartingEquipmentOption = z.infer<typeof startingEquipmentOptionSchema>;
