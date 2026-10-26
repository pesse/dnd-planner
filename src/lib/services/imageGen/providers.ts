/** Die Bild-Anbieter und ihre Einstellungen: Felder im localStorage, Tokens im OS-Keychain. */
import { invoke } from '@tauri-apps/api/core';
import { logDebug } from '../../stores/debug';
import type { GeneratedImage, ImageOptions, ImageProvider } from './types';
import { cloudflare } from './providers/cloudflare';
import { openai } from './providers/openai';
import { local } from './providers/local';

export const IMAGE_PROVIDERS: readonly ImageProvider[] = [cloudflare, openai, local];

const ACTIVE_KEY = 'imagegen-provider';
const settingsKey = (id: string) => `imagegen-${id}`;

export function imageProvider(id: string): ImageProvider {
  return IMAGE_PROVIDERS.find((p) => p.id === id) ?? IMAGE_PROVIDERS[0];
}

/** Die zuletzt gewählte — Einstellungen und Dialog teilen sie sich. */
export const activeImageProvider = (): string => imageProvider(localStorage.getItem(ACTIVE_KEY) ?? '').id;
export const setActiveImageProvider = (id: string): void => localStorage.setItem(ACTIVE_KEY, id);

/** Gespeicherte Werte ohne Defaults — das Formular soll leere Felder als leer zeigen. */
export function storedSettings(p: ImageProvider): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(settingsKey(p.id)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export async function hasSecret(p: ImageProvider): Promise<boolean> {
  return !!p.secret && !!(await loadSecret(p));
}

const loadSecret = (p: ImageProvider): Promise<string | null> =>
  p.secret
    ? invoke<string | null>('load_api_key', { provider: p.secret.keychain }).catch(() => null)
    : Promise.resolve(null);

/** Leerer Token → der gespeicherte bleibt. */
export async function saveProviderSettings(p: ImageProvider, settings: Record<string, string>, secret: string): Promise<void> {
  const trimmed = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v.trim()]));
  localStorage.setItem(settingsKey(p.id), JSON.stringify(trimmed));
  if (p.secret && secret.trim()) await invoke('save_api_key', { provider: p.secret.keychain, key: secret.trim() });
}

export async function deleteSecret(p: ImageProvider): Promise<void> {
  if (p.secret) await invoke('delete_api_key', { provider: p.secret.keychain });
}

/** Fehlertext, wenn der Prompt die Grenze des Anbieters reißt — die APIs kürzen nicht, sie lehnen ab. */
export function promptLimitError(p: ImageProvider, prompt: string): string | null {
  return p.maxPromptChars && prompt.length > p.maxPromptChars
    ? `${p.label} erlaubt höchstens ${p.maxPromptChars} Zeichen, der Prompt hat ${prompt.length}.`
    : null;
}

export interface ReadyProvider {
  /** Ohne `maxReferences` sind Referenzbilder in `options` wirkungslos — der Aufrufer prüft das vorher. */
  provider: ImageProvider;
  generate(prompt: string, options?: ImageOptions, label?: string): Promise<GeneratedImage>;
}

/** `null`, solange ein Pflichtfeld oder der Token fehlt. */
export async function readyProvider(p: ImageProvider): Promise<ReadyProvider | null> {
  const stored = storedSettings(p);
  const settings = Object.fromEntries(p.fields.map((f) => [f.key, stored[f.key] || f.default || '']));
  if (p.fields.some((f) => !settings[f.key])) return null;
  const secret = await loadSecret(p);
  if (p.secret && !secret) return null;
  return {
    provider: p,
    generate: (prompt, options, label = 'Portrait') => {
      const tooLong = promptLimitError(p, prompt);
      return tooLong ? Promise.reject(new Error(tooLong)) : loggedGenerate(p, settings, secret, prompt, options, label);
    },
  };
}

/** Das Bild selbst bleibt aus dem Log — der Store hält 100 Einträge, Base64 wären Megabytes. */
async function loggedGenerate(
  p: ImageProvider, settings: Record<string, string>, secret: string | null, prompt: string,
  options: ImageOptions | undefined, label: string,
): Promise<GeneratedImage> {
  const meta = { provider: p.label, label };
  const start = Date.now();
  logDebug({ ...meta, type: 'request', data: p.request(settings, prompt, options) });
  try {
    const image = await p.generate(settings, secret, prompt, options);
    logDebug({
      ...meta, type: 'response', durationMs: Date.now() - start,
      data: { ext: image.ext, kb: Math.round((image.b64.length * 3) / 4 / 1024), ...image.usage },
    });
    return image;
  } catch (e) {
    logDebug({ ...meta, type: 'error', data: String(e), durationMs: Date.now() - start });
    throw e;
  }
}
