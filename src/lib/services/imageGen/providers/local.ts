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
  async generate(settings, _secret, prompt) {
    const res = await httpFetch(`${settings.baseUrl.replace(/\/+$/, '')}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps: Number(settings.steps) || 25, width: 1024, height: 1024 }),
    });
    const data = (await res.json().catch(() => ({}))) as Txt2ImgResponse;
    const image = data.images?.[0];
    if (res.ok && image) return { b64: image, ext: 'png' };
    throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  },
};
