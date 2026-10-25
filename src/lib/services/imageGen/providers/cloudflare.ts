/** Cloudflare Workers AI, FLUX.1 schnell — im Free Plan enthalten. */
import { httpFetch } from '../../httpFetch';
import type { ImageProvider } from '../types';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
/** Obergrenze des Modells ist 8; mehr Schritte kosten mehr vom Tageskontingent. */
const STEPS = 4;

interface RunResponse {
  result?: { image?: string };
  errors?: { message?: string }[];
}

export const cloudflare: ImageProvider = {
  id: 'cloudflare',
  label: 'Cloudflare FLUX',
  fields: [{ key: 'accountId', label: 'Account', placeholder: 'Account-ID' }],
  secret: { keychain: 'cloudflare', placeholder: 'API-Token (Workers AI: Read)' },
  maxPromptChars: 2048,
  async generate(settings, token, prompt) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(settings.accountId)}/ai/run/${MODEL}`;
    const res = await httpFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps: STEPS }),
    });
    const data = (await res.json().catch(() => ({}))) as RunResponse;
    const image = data.result?.image;
    if (res.ok && image) return { b64: image, ext: 'jpg' };
    throw new Error(data.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`);
  },
};
