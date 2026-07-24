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
 * Optionaler Tap: erhält jeden Debug-Eintrag zusätzlich zum Store. Standard: keiner
 * (no-op) — nur die Eval-Strecke registriert einen, um Requests/Responses pro Lauf
 * korrekt zuzuordnen (auch bei parallelen Läufen). Kein Einfluss auf die App.
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
    // Maximal 100 Einträge behalten
    return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
  });
}

export function clearDebugLog(): void {
  debugLog.set([]);
}
