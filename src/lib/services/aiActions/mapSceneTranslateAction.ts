/** Übersetzt die deutsche Szenenbeschreibung eines Kartenbilds ins Englische, das die Bildmodelle verstehen. */
import type { AiAction } from './types';
import {
  mapSceneTranslationJsonSchema, parseMapSceneTranslation, type MapSceneTranslation,
} from '../../schemas/mapSceneTranslation';

const SYSTEM = `You translate a short German description of a location into English for the scene part of a top-down battle map image prompt.

<rules>
- Render visual meaning, not words, as concrete comma-separated phrases about what lies where. Never leave a German word in the output.
- Add nothing the input does not say; drop nothing it does. Directions ("im Norden") and counts stay as given.
- Leave out camera, style and lighting instructions; the prompt adds those itself.
- Text that is already English is passed through unchanged.
</rules>`;

export function buildMapSceneTranslateAction(): AiAction<MapSceneTranslation> {
  return {
    id: 'map-scene-translate',
    label: 'Kartenszene übersetzen',
    // Tool-frei → `runAiAction` nimmt den Single-Call-Pfad.
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: mapSceneTranslationJsonSchema,
    validate: (d): d is MapSceneTranslation => parseMapSceneTranslation(d) !== null,
    buildSystemPrompt: () => SYSTEM,
  };
}

export const buildMapSceneTranslateInput = (scene: string): string => `<source_de>\n${scene.trim()}\n</source_de>`;
