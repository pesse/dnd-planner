/** OpenAI Images API; gpt-image-Modelle liefern immer Base64. */
import { httpFetch } from '../../httpFetch';
import type { ImageProvider } from '../types';

interface ImagesResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string };
}

export const openai: ImageProvider = {
  id: 'openai',
  label: 'OpenAI',
  fields: [{ key: 'model', label: 'Modell', placeholder: 'gpt-image-1', default: 'gpt-image-1' }],
  secret: { keychain: 'openai', placeholder: 'API-Key (sk-…)' },
  maxPromptChars: 32000,
  understandsGerman: true,
  request: (settings, prompt) => ({
    url: 'https://api.openai.com/v1/images/generations',
    body: { model: settings.model, prompt, size: '1024x1024', output_format: 'jpeg', n: 1 },
  }),
  async generate(settings, key, prompt, options = {}) {
    const { url, body } = openai.request(settings, prompt);
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
