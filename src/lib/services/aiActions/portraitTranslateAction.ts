/** Übersetzt die deutschen Aussehens-Texte eines Portraits ins Englische, das die Bildmodelle verstehen. */
import type { AiAction } from './types';
import {
  parsePortraitTranslation,
  portraitTranslationJsonSchema,
  type PortraitTextKey,
  type PortraitTranslation,
} from '../../schemas/portraitTranslation';

// „hell" und „Mist" sind die falschen Freunde, an denen ein englisches Bildmodell scheitert.
// Gemessen in pesse/prompt-eval (`make eval-portrait`): eine Änderung hier auch in prompts/portrait-v1/system.md.
const SYSTEM = `You translate short German descriptions of a fantasy character's looks into English for an image-generation prompt.

<rules>
- Translate each field of <source_de> into the field with the same name. A field missing from the input stays "".
- Render visual meaning, not words: "hell" (skin) is "fair", "Mist" is "dung", "braun gebrannt" is "tanned". Never leave a German word in the output.
- Keep it short and concrete: comma-separated visual descriptors, no full sentences unless the input has them.
- Add nothing the input does not say; drop nothing it does. Numbers and units stay as given ("1,35m" → "1.35 m").
- Text that is already English is passed through unchanged.
</rules>`;

export function buildPortraitTranslateAction(): AiAction<PortraitTranslation> {
  return {
    id: 'portrait-translate',
    label: 'Portrait-Texte übersetzen',
    // Tool-frei → `runAiAction` nimmt den Single-Call-Pfad.
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: portraitTranslationJsonSchema,
    validate: (d): d is PortraitTranslation => parsePortraitTranslation(d) !== null,
    buildSystemPrompt: () => SYSTEM,
  };
}

export function buildPortraitTranslateInput(texts: Partial<Record<PortraitTextKey, string>>): string {
  const filled = Object.fromEntries(Object.entries(texts).filter(([, v]) => v?.trim()));
  return `<source_de>\n${JSON.stringify(filled, null, 2)}\n</source_de>`;
}
