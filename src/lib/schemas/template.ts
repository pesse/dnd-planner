/** Kopf einer Kampagnen-Vorlage aus einem Pack (`templates/campaigns/<id>/template.json`). */
import { z } from 'zod';

export const campaignTemplateSchema = z.object({
  name: z.string().describe('Anzeigename der Vorlage'),
  description: z.string().default(''),
  characters: z
    .array(z.string())
    .default([])
    .describe('Ordnernamen unter `templates/characters/`: vorgefertigte Charaktere, die mitkopiert werden können'),
  playerEditionOf: z
    .string()
    .optional()
    .describe('Ordnername der Spielleiter-Vorlage, zu der dies die spoilerfreie Spieler-Ausgabe ist'),
});

export type CampaignTemplate = z.infer<typeof campaignTemplateSchema>;
