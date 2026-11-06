/** OpenAI Images API; gpt-image-Modelle liefern immer Base64. */
import { httpFetch } from '../../httpFetch';
import type { ImageProvider } from '../types';

interface ImagesResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string };
}

/** gpt-image kennt nur diese drei Größen; das Seitenverhältnis entscheidet. */
function sizeFor(width = 1024, height = 1024): string {
  if (width > height) return '1536x1024';
  return width < height ? '1024x1536' : '1024x1024';
}

export const openai: ImageProvider = {
  id: 'openai',
  label: 'OpenAI',
  fields: [{ key: 'model', label: 'Modell', placeholder: 'gpt-image-1', default: 'gpt-image-1' }],
  secret: { keychain: 'openai', placeholder: 'API-Key (sk-…)' },
  maxPromptChars: 32000,
  understandsGerman: true,
  request: (settings, prompt, options = {}) => ({
    url: 'https://api.openai.com/v1/images/generations',
    body: { model: settings.model, prompt, size: sizeFor(options.width, options.height), output_format: 'jpeg', n: 1 },
  }),
  async generate(settings, key, prompt, options = {}) {
    const { url, body } = openai.request(settings, prompt, options);
    const res = await httpFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const data = (await res.json().catch(() => ({}))) as ImagesResponse;
    const image = data.data?.[0]?.b64_json;
    if (res.ok && image) return { b64: image, ext: 'jpg' };
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  },
};
