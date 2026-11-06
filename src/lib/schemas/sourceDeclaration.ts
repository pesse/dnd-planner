/** Eine Herkunft, die ein Pack unter `vault/sources/` mitbringt — die App kennt sie erst daraus. */
import { z } from 'zod';
import { SOURCE_SLUG_RE } from './source';

export const sourceDeclarationSchema = z.object({
  // Heißt `source` wie in jedem Artefakt: daran ordnet der Pack-Build die Datei ihrem Pack zu.
  source: z.string().regex(SOURCE_SLUG_RE).describe('Die Herkunft, wie sie im `source`-Feld der Inhalte steht.'),
  label: z.string().min(1).describe('Kurzname für Filter und Karten, z. B. „Hellfire Club".'),
  title: z.string().min(1).describe('Voller Buchtitel.'),
  ddbSourceIds: z
    .array(z.number().int().positive())
    .default([])
    .describe('Buch-IDs bei D&D Beyond: fehlende Inhalte dieser Bücher legt der Import unter dieser Herkunft an.'),
  includes: z
    .object({
      monsters: z.array(z.string()).default([]).describe('Keys der Monster, z. B. "srd-2024_goblin-warrior".'),
      items: z.array(z.string()).default([]).describe('Keys der Gegenstände, z. B. "srd-2024_potion-of-healing".'),
    })
    .default({ monsters: [], items: [] })
    .describe('Einträge anderer Herkunft, die das Buch abdruckt oder verwendet: Der Quellfilter des Buchs zeigt sie mit.'),
});

export type SourceDeclaration = z.infer<typeof sourceDeclarationSchema>;
