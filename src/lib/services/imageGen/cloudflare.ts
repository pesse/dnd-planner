/** Bildgenerierung über Cloudflare Workers AI (FLUX.1 schnell, im Free Plan enthalten). */
import { invoke } from '@tauri-apps/api/core';
import { httpFetch } from '../httpFetch';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
/** Obergrenze des Modells ist 8; mehr Schritte kosten mehr vom Tageskontingent. */
const STEPS = 4;
export const MAX_PROMPT_CHARS = 2048;

const ACCOUNT_STORAGE_KEY = 'imagegen-cloudflare-account';
/** Service-Name im OS-Keychain, neben den LLM-Providern. */
const KEYCHAIN_SERVICE = 'cloudflare';

export interface CloudflareConfig { accountId: string; token: string; }

/** Die Account-ID ist kein Geheimnis und liegt im localStorage, der Token im Keychain. */
export async function loadCloudflareConfig(): Promise<CloudflareConfig | null> {
  const accountId = localStorage.getItem(ACCOUNT_STORAGE_KEY)?.trim() ?? '';
  const token = await invoke<string | null>('load_api_key', { provider: KEYCHAIN_SERVICE }).catch(() => null);
  return accountId && token ? { accountId, token } : null;
}

/** Leerer Token → der gespeicherte bleibt. */
export async function saveCloudflareConfig(accountId: string, token: string): Promise<void> {
  localStorage.setItem(ACCOUNT_STORAGE_KEY, accountId.trim());
  if (token.trim()) await invoke('save_api_key', { provider: KEYCHAIN_SERVICE, key: token.trim() });
}

export async function deleteCloudflareToken(): Promise<void> {
  await invoke('delete_api_key', { provider: KEYCHAIN_SERVICE });
}

export async function hasCloudflareToken(): Promise<boolean> {
  return !!(await invoke<string | null>('load_api_key', { provider: KEYCHAIN_SERVICE }).catch(() => null));
}

export const storedCloudflareAccountId = (): string => localStorage.getItem(ACCOUNT_STORAGE_KEY) ?? '';

interface RunResponse {
  success?: boolean;
  result?: { image?: string };
  errors?: { code?: number; message?: string }[];
}

/** Liefert das Bild als Base64-JPEG (1024×1024). */
export async function generateImage(config: CloudflareConfig, prompt: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${MODEL}`;
  const res = await httpFetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.slice(0, MAX_PROMPT_CHARS), steps: STEPS }),
  });
  const data = (await res.json().catch(() => ({}))) as RunResponse;
  const image = data.result?.image;
  if (res.ok && image) return image;
  const reason = data.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
  throw new Error(reason);
}
