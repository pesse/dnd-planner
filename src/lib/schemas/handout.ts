/** Ein Handout: ein Bild, das die Spielleitung den Spielern zeigt, mit Abschrift. */
import { z } from 'zod';

export const handoutSchema = z.object({
  name: z.string(),
  image: z.string().default('').describe('Dateiname des Bilds neben der Handout-Datei.'),
  text: z.string().default('').describe('Abschrift auf Deutsch, für alle, die das Bild nicht lesen können.'),
});

export type Handout = z.infer<typeof handoutSchema>;
