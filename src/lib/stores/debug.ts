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

/**
 * Einziger Nutzer ist die Eval-Strecke (`evals/report.ts`): sie ordnet Requests/Responses
 * auch bei parallelen Läufen dem richtigen Lauf zu, was über den Store allein nicht geht.
 */
type DebugTap = (entry: DebugEntry) => void;
let _tap: DebugTap | null = null;

export function setDebugTap(tap: DebugTap | null): void {
  _tap = tap;
}

export function logDebug(entry: Omit<DebugEntry, 'id' | 'timestamp'>): void {
  const newEntry: DebugEntry = { ...entry, id: _nextId++, timestamp: new Date() };
  _tap?.(newEntry);
  debugLog.update((log) => {
    const updated = [...log, newEntry];
    return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
  });
}

export function clearDebugLog(): void {
  debugLog.set([]);
}
