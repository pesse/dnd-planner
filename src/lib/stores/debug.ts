import { writable } from 'svelte/store';

export interface DebugEntry {
  id: number;
  timestamp: Date;
  provider: string;
  type: 'request' | 'response' | 'error';
  label: string;
  data: unknown;
  durationMs?: number;
}

let _nextId = 0;

export const debugLog = writable<DebugEntry[]>([]);

export function logDebug(entry: Omit<DebugEntry, 'id' | 'timestamp'>): void {
  debugLog.update((log) => {
    const newEntry: DebugEntry = { ...entry, id: _nextId++, timestamp: new Date() };
    const updated = [...log, newEntry];
    // Maximal 100 Einträge behalten
    return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
  });
}

export function clearDebugLog(): void {
  debugLog.set([]);
}
