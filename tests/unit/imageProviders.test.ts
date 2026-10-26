/**
 * Bild-Anbieter: Bereitschaft aus Einstellungen und Token, Request- und Antwortform je API.
 *
 *   npm run test -- imageProviders
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageProvider, promptLimitError, readyProvider } from '../../src/lib/services/imageGen/providers';
import { kleinNeurons } from '../../src/lib/services/imageGen/providers/cloudflare';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  };
}

function stubFetch(body: unknown, status = 200) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('readyProvider', () => {
  it('braucht für Anbieter mit Token den Token — der Test-Shim kennt keinen', async () => {
    localStorage.setItem('imagegen-cloudflare', JSON.stringify({ accountId: 'acc' }));
    expect(await readyProvider(imageProvider('cloudflare'))).toBeNull();
  });

  it('nimmt für den lokalen Anbieter die Defaults, wenn nichts gespeichert ist', async () => {
    const fetch = stubFetch({ images: ['UE5H'] });
    const ready = await readyProvider(imageProvider('local'));
    expect(await ready!.generate('a dwarf')).toEqual({ b64: 'UE5H', ext: 'png' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:7860/sdapi/v1/txt2img');
    expect(JSON.parse(init.body as string)).toMatchObject({ prompt: 'a dwarf', steps: 25 });
  });

  it('meldet den Fehlertext des Servers', async () => {
    stubFetch({ detail: 'Model not loaded' }, 500);
    const ready = await readyProvider(imageProvider('local'));
    await expect(ready!.generate('a dwarf')).rejects.toThrow('Model not loaded');
  });
});

describe('Anbieter-APIs', () => {
  it('Cloudflare: Account in der URL, Hochformat als multipart, Bild aus result.image', async () => {
    const fetch = stubFetch({ success: true, result: { image: '/9j/JPEG' } });
    const img = await imageProvider('cloudflare').generate({ accountId: 'acc' }, 'tok', 'a dwarf');
    expect(img).toEqual({ b64: '/9j/JPEG', ext: 'jpg', usage: { neurons: 104.2 } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/accounts/acc/ai/run/@cf/black-forest-labs/flux-2-klein-4b');
    const form = init.body as FormData;
    expect([form.get('prompt'), form.get('width'), form.get('height')]).toEqual(['a dwarf', '768', '1024']);
    expect(form.has('steps')).toBe(false);
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('Cloudflare: Referenzbilder als input_image_0…, Maße im Log statt der Bytes', async () => {
    const fetch = stubFetch({ result: { image: '/9j/JPEG' } });
    const references = [
      { blob: new Blob(['doll'], { type: 'image/jpeg' }), width: 341, height: 512 },
      { blob: new Blob(['face'], { type: 'image/jpeg' }), width: 384, height: 512 },
    ];
    const cf = imageProvider('cloudflare');
    const img = await cf.generate({ accountId: 'acc' }, 'tok', 'edit', { width: 640, height: 960, references });
    const form = fetch.mock.calls[0][1].body as FormData;
    expect(await (form.get('input_image_1') as File).text()).toBe('face');
    expect([form.get('width'), form.get('height')]).toEqual(['640', '960']);
    expect(img.usage).toEqual({ neurons: 104.2 + 2 * 5.37 });
    expect(cf.request({ accountId: 'acc' }, 'edit', { references }).references?.[0]).toMatch(/^input_image_0: 341×512/);
  });

  it('reichen das Abbruch-Signal an den Request durch', async () => {
    const fetch = stubFetch({ result: { image: '/9j/JPEG' }, data: [{ b64_json: 'JPEG' }], images: ['UE5H'] });
    const { signal } = new AbortController();
    for (const id of ['cloudflare', 'openai', 'local']) {
      await imageProvider(id).generate({ accountId: 'acc', baseUrl: 'http://x', model: 'm' }, 'tok', 'x', { signal });
    }
    expect(fetch.mock.calls.map(([, init]) => init.signal)).toEqual([signal, signal, signal]);
  });

  it('Cloudflare: PNG an der Base64-Signatur erkannt', async () => {
    stubFetch({ result: { image: 'iVBORw0K' } });
    expect((await imageProvider('cloudflare').generate({ accountId: 'acc' }, 'tok', 'x')).ext).toBe('png');
  });

  it('OpenAI: Modell aus den Einstellungen, Bild aus data[0].b64_json', async () => {
    const fetch = stubFetch({ data: [{ b64_json: 'JPEG' }] });
    const img = await imageProvider('openai').generate({ model: 'gpt-image-1' }, 'sk', 'a dwarf');
    expect(img).toEqual({ b64: 'JPEG', ext: 'jpg' });
    const init = fetch.mock.calls[0][1];
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'gpt-image-1', output_format: 'jpeg' });
  });
});

describe('kleinNeurons', () => {
  it('rechnet je angefangener 512²-Kachel', () => {
    expect(kleinNeurons(1024, 1024)).toBe(104.2);
    expect(kleinNeurons(768, 1024)).toBe(104.2);
    expect(kleinNeurons(512, 512)).toBe(26.05);
  });
});

describe('promptLimitError', () => {
  it('greift erst über der Grenze des Anbieters, beim lokalen nie', () => {
    const cf = imageProvider('cloudflare');
    expect(promptLimitError(cf, 'x'.repeat(2048))).toBeNull();
    expect(promptLimitError(cf, 'x'.repeat(2049))).toContain('höchstens 2048 Zeichen');
    expect(promptLimitError(imageProvider('local'), 'x'.repeat(50_000))).toBeNull();
  });

  it('schickt einen zu langen Prompt gar nicht erst ab', async () => {
    const fetch = stubFetch({ images: ['UE5H'] });
    const local = imageProvider('local');
    const ready = await readyProvider({ ...local, maxPromptChars: 10 });
    await expect(ready!.generate('x'.repeat(11))).rejects.toThrow('höchstens 10 Zeichen');
    expect(fetch).not.toHaveBeenCalled();
  });
});
