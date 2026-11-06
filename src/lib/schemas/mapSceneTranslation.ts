/** Englische Fassung einer Szenenbeschreibung für ein Kartenbild. */
import { z } from 'zod';
import { toLlmJsonSchema } from './llmJson';

export const mapSceneTranslationSchema = z.object({
  scene: z.string().describe('English rendering of the scene description, as concrete visual phrases.'),
});

export type MapSceneTranslation = z.infer<typeof mapSceneTranslationSchema>;

export const mapSceneTranslationJsonSchema = toLlmJsonSchema(mapSceneTranslationSchema);

export function parseMapSceneTranslation(data: unknown): MapSceneTranslation | null {
  const r = mapSceneTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
