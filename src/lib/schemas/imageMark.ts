/** Fehler-Markierung auf einem Bild der App, gesetzt mit Shift+M. */
import { z } from 'zod';

export const IMAGE_MARK_STATUSES = ['open', 'fixed'] as const;
export type ImageMarkStatus = (typeof IMAGE_MARK_STATUSES)[number];

export const imageMarkSchema = z.object({
  id: z.string(),
  address: z.string().describe('Stabile Adresse des Bilds, z. B. `vault/art/monsters/goblin.avif`'),
  url: z.string().nullable().describe('Die URL, unter der das Bild angezeigt wurde; null bei eingebetteten Bildern'),
  where: z.string().describe('Wo in der App das Bild zu sehen war'),
  x: z.number().min(0).max(1).describe('Anteil der Bildbreite, 0 = linker Rand der Bilddatei'),
  y: z.number().min(0).max(1).describe('Anteil der Bildhöhe, 0 = oberer Rand der Bilddatei'),
  width: z.number().int().nonnegative().describe('Pixelbreite der Bilddatei'),
  height: z.number().int().nonnegative(),
  text: z.string(),
  status: z.enum(IMAGE_MARK_STATUSES),
  fingerprint: z.string().nullable().describe('SHA-256 der Bilddatei beim Markieren; ändert sie sich, gilt der Fehler als korrigiert'),
  createdAt: z.string(),
});
export type ImageMark = z.infer<typeof imageMarkSchema>;
