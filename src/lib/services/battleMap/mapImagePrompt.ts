/** Prompt-Bausteine für ein generiertes Kartenbild: Szene + Draufsicht + ggf. Wände + Stil. */

const TOP_DOWN =
  'Top-down orthographic battle map for a tabletop RPG, camera pointing straight down, every object seen exactly from above, ' +
  'no perspective, no horizon. The map fills the whole image edge to edge. ' +
  'No grid lines, no text, no labels, no border, no frame, no people, no creatures.';

// Gemessen an klein 4B: „orthographic" allein oder ein Grundriss-Schnitt malen weiter Wandflächen
// wie im Puppenhaus, erst der Verweis auf VTT-Kartenstil macht die Wände flach.
const FLAT_WALLS =
  'In the style of a Dungeondraft or Forgotten Adventures virtual tabletop map: walls are thick flat dark outlines ' +
  'seen straight from above with no visible vertical surfaces, doors drawn as flat rectangles in the wall line, ' +
  'furniture seen strictly from above.';

export const MAP_SETTINGS = { indoor: 'Innenraum', outdoor: 'Gelände' } as const;
export type MapSetting = keyof typeof MAP_SETTINGS;

export const MAP_STYLES = [
  { id: 'painted', label: 'Gemalt', prompt: 'Hand-painted digital art, rich colours, soft ambient light, crisp detail.' },
  { id: 'dark', label: 'Düster', prompt: 'Dark and gritty hand-painted art, desaturated colours, deep shadows, warm torchlight pools.' },
] as const;
export type MapStyle = (typeof MAP_STYLES)[number]['id'];

export const MAP_FORMATS = {
  landscape: { label: 'Quer', width: 1536, height: 1024 },
  portrait: { label: 'Hoch', width: 1024, height: 1536 },
  square: { label: 'Quadratisch', width: 1024, height: 1024 },
} as const;
export type MapFormat = keyof typeof MAP_FORMATS;

export function buildMapPrompt(scene: string, setting: MapSetting, style: MapStyle): string {
  const stylePrompt = MAP_STYLES.find((s) => s.id === style)?.prompt ?? MAP_STYLES[0].prompt;
  return [scene.trim().replace(/\.?$/, '.'), TOP_DOWN, setting === 'indoor' ? FLAT_WALLS : '', stylePrompt]
    .filter(Boolean).join(' ');
}
