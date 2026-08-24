import { writable } from 'svelte/store';
import type { FileEntry } from '../types';

/**
 * Verlauf der geöffneten Einträge in Browser-Semantik: ein neues Ziel verwirft den
 * Vor-Stapel. Bewegt wird er ausschließlich aus `services/navigation` — ein direktes
 * `activeFile.set` verstimmt ihn hinter dem Rücken.
 */
export const navHistoryState = writable({ canBack: false, canForward: false });

const LIMIT = 50;

let backStack: FileEntry[] = [];
let forwardStack: FileEntry[] = [];
let current: FileEntry | null = null;

function sync(): void {
  navHistoryState.set({ canBack: backStack.length > 0, canForward: forwardStack.length > 0 });
}

/** Derselbe Pfad wie der aktive Eintrag wird ersetzt, sonst sammelt Doppelklicken Leerlauf. */
export function pushHistory(entry: FileEntry): void {
  if (current && current.path === entry.path && current.type === entry.type) {
    current = entry;
    return;
  }
  if (current) backStack.push(current);
  if (backStack.length > LIMIT) backStack.shift();
  forwardStack = [];
  current = entry;
  sync();
}

/** Umbenennen und Speichern-unter: derselbe Eintrag unter neuem Pfad. */
export function replaceHistory(entry: FileEntry): void {
  current = entry;
}

/** Aktives Ziel ist weg (gelöscht, Neuanlage verworfen) — der Zurück-Weg trägt weiter. */
export function dropHistoryCurrent(): void {
  current = null;
  sync();
}

/**
 * Nächstes erreichbares Ziel in Richtung `dir` (−1 zurück, +1 vor). Was `reachable`
 * ablehnt, fällt aus dem Verlauf, statt als Fehlerkarte zu landen.
 */
export async function stepHistory(
  dir: -1 | 1,
  reachable: (entry: FileEntry) => Promise<boolean>,
): Promise<FileEntry | null> {
  const from = dir === -1 ? backStack : forwardStack;
  while (from.length) {
    const candidate = dir === -1 ? from.pop()! : from.shift()!;
    if (!(await reachable(candidate))) continue;
    if (current) {
      if (dir === -1) forwardStack.unshift(current);
      else backStack.push(current);
    }
    current = candidate;
    sync();
    return candidate;
  }
  sync();
  return null;
}
