/** Lokaler Stable-Diffusion-Server mit der API von AUTOMATIC1111 (auch Forge, SD.Next). */
import { httpFetch } from '../../httpFetch';
import type { ImageProvider } from '../types';

interface Txt2ImgResponse { images?: string[]; detail?: string; error?: string; }

export const local: ImageProvider = {
  id: 'local',
  label: 'Lokal (A1111/Forge)',
  fields: [
    { key: 'baseUrl', label: 'URL', placeholder: 'http://127.0.0.1:7860', default: 'http://127.0.0.1:7860' },
    { key: 'steps', label: 'Schritte', placeholder: '25', default: '25' },
  ],
  request: (settings, prompt) => ({
    url: `${settings.baseUrl.replace(/\/+$/, '')}/sdapi/v1/txt2img`,
    body: { prompt, steps: Number(settings.steps) || 25, width: 1024, height: 1024 },
  }),
  async generate(settings, _secret, prompt, options = {}) {
    const { url, body } = local.request(settings, prompt);
    const res = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Txt2ImgResponse;
    const image = data.images?.[0];
    if (res.ok && image) return { b64: image, ext: 'png' };
    throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  },
};
