/** `@tauri-apps/api/core` im Browser unter `npm run dev:vault`: `invoke` geht an die Vault-Brücke. */
export * from '../../node_modules/@tauri-apps/api/core.js';

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/__invoke/${cmd}`, { method: 'POST', body: JSON.stringify(args ?? {}) });
  const data: unknown = await res.json();
  if (!res.ok) throw String(data);
  return data as T;
}

export const convertFileSrc = (filePath: string): string => `/__vault-file?p=${encodeURIComponent(filePath)}`;
