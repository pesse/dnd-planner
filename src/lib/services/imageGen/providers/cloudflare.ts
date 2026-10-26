/** Cloudflare Workers AI, FLUX.2 klein 4B — im Free Plan enthalten (10 000 Neurons am Tag). */
import { httpFetch } from '../../httpFetch';
import type { ImageProvider, ReferenceImage } from '../types';

const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const WIDTH = 768;
const HEIGHT = 1024;

/** Abgerechnet wird je angefangener 512²-Kachel, Schritte sind fest. */
const NEURONS_PER_OUTPUT_TILE = 26.05;
const NEURONS_PER_INPUT_TILE = 5.37;

const tiles = (width: number, height: number): number => Math.ceil(width / 512) * Math.ceil(height / 512);

export function kleinNeurons(width: number, height: number, references: ReferenceImage[] = []): number {
  const input = references.reduce((sum, r) => sum + tiles(r.width, r.height), 0);
  return Math.round((tiles(width, height) * NEURONS_PER_OUTPUT_TILE + input * NEURONS_PER_INPUT_TILE) * 100) / 100;
}

const referenceField = (i: number): string => `input_image_${i}`;

interface RunResponse {
  result?: { image?: string };
  errors?: { code?: number; message?: string }[];
}

export const cloudflare: ImageProvider = {
  id: 'cloudflare',
  label: 'Cloudflare FLUX',
  fields: [{ key: 'accountId', label: 'Account', placeholder: 'Account-ID' }],
  secret: { keychain: 'cloudflare', placeholder: 'API-Token (Workers AI)' },
  maxPromptChars: 2048,
  maxReferences: 4,
  help: 'cloudflarePortrait',
  request: (settings, prompt, options = {}) => ({
    url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(settings.accountId)}/ai/run/${MODEL}`,
    body: { prompt, width: options.width ?? WIDTH, height: options.height ?? HEIGHT },
    references: options.references?.map((r, i) => `${referenceField(i)}: ${r.width}×${r.height}, ${Math.round(r.blob.size / 1024)} kB`),
  }),
  async generate(settings, token, prompt, options = {}) {
    const { url, body } = cloudflare.request(settings, prompt, options);
    // Das Modell nimmt nur multipart an. Kein Content-Type von Hand — die Boundary setzt erst `Request`.
    const form = new FormData();
    for (const [k, v] of Object.entries(body)) form.append(k, String(v));
    options.references?.forEach((r, i) => form.append(referenceField(i), r.blob, `${referenceField(i)}.jpg`));
    const res = await httpFetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: options.signal });
    const data = (await res.json().catch(() => ({}))) as RunResponse;
    const image = data.result?.image;
    if (res.ok && image) {
      const neurons = kleinNeurons(Number(body.width), Number(body.height), options.references);
      return { b64: image, ext: image.startsWith('iVBOR') ? 'png' : 'jpg', usage: { neurons } };
    }
    const messages = data.errors?.map((e) => (e.code ? `${e.message} (${e.code})` : e.message)).filter(Boolean);
    throw new Error(messages?.join('; ') || `HTTP ${res.status}`);
  },
};
