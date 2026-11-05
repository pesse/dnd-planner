/** Fortschritt einer aus einer Vorlage angelegten Kampagne (`campaigns/<slug>/progress.json`). */
import { z } from 'zod';

export const campaignProgressSchema = z.object({
  template: z.string().describe('Ordnername der Vorlage unter `templates/campaigns/`, aus der die Kampagne stammt'),
  completed: z.array(z.string()).default([]).describe('`id`s der abgeschlossenen Abenteuer (`chapters` der Vorlage)'),
  templateFingerprint: z
    .string()
    .optional()
    .describe('Inhalts-Fingerabdruck der Vorlage beim Anlegen; weicht der heutige ab, hat ein Pack sie geändert'),
});

export type CampaignProgress = z.infer<typeof campaignProgressSchema>;
