/** Englische Fassung der Portrait-Texte, je Prompt-Feld — feste Keys statt einer Liste, die verrutschen kann. */
import { z } from 'zod';
import { toLlmJsonSchema } from './llmJson';

const field = (what: string) => z.string().default('').describe(`English rendering of the ${what}; "" if the input had none.`);

export const portraitTranslationSchema = z.object({
  age: field('age'),
  height: field('height'),
  skin: field('skin colour'),
  hair: field('hair'),
  eyes: field('eye colour'),
  appearance: field('appearance notes'),
  extra: field('additional wishes'),
});

export type PortraitTranslation = z.infer<typeof portraitTranslationSchema>;
export type PortraitTextKey = keyof PortraitTranslation;

export const portraitTranslationJsonSchema = toLlmJsonSchema(portraitTranslationSchema);

export function parsePortraitTranslation(data: unknown): PortraitTranslation | null {
  const r = portraitTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
