/** Kopf einer Kampagnen-Vorlage aus einem Pack (`templates/campaigns/<id>/template.json`). */
import { z } from 'zod';

export const templateChapterSchema = z.object({
  id: z.string().describe('Ordnername unter `templates/chapters/<vorlage>/`, falls das Abenteuer Spieler-Infos nachliefert'),
  title: z.string(),
  level: z.number().int().min(1).describe('Charakterstufe, auf der die Gruppe das Abenteuer beginnt'),
});

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
  chapters: z.array(templateChapterSchema).default([]).describe('Die Abenteuer der Vorlage in Spielreihenfolge'),
});

export type TemplateChapter = z.infer<typeof templateChapterSchema>;
export type CampaignTemplate = z.infer<typeof campaignTemplateSchema>;
