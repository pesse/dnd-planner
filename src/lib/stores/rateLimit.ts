import { writable } from 'svelte/store';

/**
 * Wartephasen bei HTTP 429. Einziger Erzeuger ist `withRateLimitRetry` (retry.ts) — damit
 * gilt der Toast für alle LLM-Pfade, ohne dass ein Aufrufer etwas melden muss.
 */

export interface RateLimitWait {
  id: number;
  provider: string;
  message: string;
}

let _next = 1;
export const rateLimitWaits = writable<RateLimitWait[]>([]);

/** Rückgabe ist die ID für `clearRateLimitWait`. */
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
