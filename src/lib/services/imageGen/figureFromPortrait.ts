/** Figur „Am Körper" mit dem Gesicht des Portraits: die gemalte Gliederpuppe als Vorlage, das Portrait als Gesicht. */
import { paperdollCandidates, resolveOriginArt } from '../wizard/originArt';
import type { Presentation } from '../../schemas/characterSchema';
import type { ReadyProvider } from './providers';
import type { GeneratedImage, ReferenceImage } from './types';

/**
 * Die Plätze von `FIGURE_SOCKETS` sitzen auf der Puppe — Pose und Ausschnitt dürfen sich nicht ändern.
 * Kein Wort über Körper und Haut: „skin on every visible part of the body" ließ Cloudflare das Ergebnis sperren (3030).
 * FLUX.2 zählt die Referenzen als „image 1", „image 2"; der Inhalt steht dabei, damit keine Verwechslung bleibt.
 */
export const figureFacePrompt = (traits: string): string => [
  'Family-friendly character art for a D&D character creator: the character whose head is shown in image 1 (portrait),',
  'painted full-length in the exact pose and framing of the standing adventurer in image 2 (full-length figure).',
  'Head, face, hairstyle, hair color and facial hair come only from image 1 — same length, cut, volume and color;',
  'the hair of image 2 does not appear. Same eye color and complexion as image 1.',
  // Ein eigenes Portrait kann ein dunkles Ganzkörperbild sein — dann ist der Bogentext verlässlicher.
  traits && `The character from image 1: ${traits} Where this description and image 1 differ, follow the description.`,
  // Kleidung positiv benennen: „fully clothed" holte Mantel und Rüstung aus dem Portrait,
  // „plain clothes with nothing added — no cloak, armor …" ließ Cloudflare das Ergebnis sperren (3030).
  'The character wears the same modest everyday clothes as the figure in image 2; clothing, background and lighting',
  'come only from image 2. Keep the pose, the position of head, hands and feet, the framing, the plain background',
  'and the painting style of image 2. No text.',
].filter(Boolean).join(' ');

/** Maße der gemalten Puppen unter `static/art/figures/`. */
const FIGURE_WIDTH = 640;
const FIGURE_HEIGHT = 960;

/** FLUX.2 verlangt Referenzen unter 512² Pixeln; die längere Seite auf 512 bleibt darunter. */
const MAX_REFERENCE_SIDE = 512;

export interface Crop { x: number; y: number; width: number; height: number; }

/** Vorbelegung: volle Höhe, ein Querformat mittig aufs Quadrat beschnitten. */
export function defaultCrop(width: number, height: number): Crop {
  const w = Math.min(width, height);
  return { x: Math.round((width - w) / 2), y: 0, width: w, height };
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export async function toReference(src: string, crop?: Crop, maxSide = MAX_REFERENCE_SIDE): Promise<ReferenceImage> {
  const img = await loadImage(src);
  const area = crop ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
  const scale = Math.min(1, maxSide / Math.max(area.width, area.height));
  const width = Math.round(area.width * scale);
  const height = Math.round(area.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Referenzbild ließ sich nicht kodieren'))), 'image/jpeg', 0.9));
  return { blob, width, height };
}

export const imageDataUrl = (img: GeneratedImage): string =>
  `data:image/${img.ext === 'png' ? 'png' : 'jpeg'};base64,${img.b64}`;

export async function figureFromPortrait(
  ready: ReadyProvider, face: ReferenceImage, speciesKey: string, presentation: Presentation | undefined, prompt: string,
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const doll = await resolveOriginArt(paperdollCandidates(speciesKey, presentation));
  if (!doll) throw new Error('Keine Gliederpuppe als Vorlage gefunden');
  // Als zweites Bild setzte sich das Portrait nicht gegen die Puppenfrisur durch.
  const references = [face, await toReference(doll)];
  return ready.generate(prompt, { width: FIGURE_WIDTH, height: FIGURE_HEIGHT, references, signal }, 'Figur');
}
