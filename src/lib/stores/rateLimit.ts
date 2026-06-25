import { writable } from 'svelte/store';

/**
 * Aktive Rate-Limit-Wartephasen (HTTP 429). Gespeist aus dem zentralen
 * `withRateLimitRetry` (retry.ts) — daher konsistent für ALLE LLM-Pfade
 * (chat, generate, agentLoop, json-korrektur-Fallback). Ein einzelner globaler
 * Toast (RateLimitToast) rendert daraus; analog zum errors-Store/ErrorToast.
 */

export interface RateLimitWait {
  id: number;
  provider: string;
  message: string;
}

let _next = 1;
export const rateLimitWaits = writable<RateLimitWait[]>([]);

/** Beginnt eine sichtbare Wartephase; gibt die ID zum späteren Entfernen zurück. */
export function pushRateLimitWait(info: { provider: string; waitMs: number; attempt: number }): number {
  const id = _next++;
  const seconds = (info.waitMs / 1000).toFixed(1);
  const message = `${info.provider}: Rate-Limit erreicht — warte ${seconds}s, dann erneuter Versuch (${info.attempt}).`;
  rateLimitWaits.update((list) => [...list, { id, provider: info.provider, message }]);
  return id;
}

export function clearRateLimitWait(id: number): void {
  rateLimitWaits.update((list) => list.filter((w) => w.id !== id));
}
