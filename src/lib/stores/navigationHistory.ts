import { writable } from 'svelte/store';
import type { FileEntry } from '../types';
import type { ViewState } from '../services/viewState';

/**
 * Verlauf der besuchten Orte in Browser-Semantik: ein neues Ziel verwirft den Vor-Stapel.
 * Bewegt wird er ausschließlich aus `services/navigation` — ein direktes `activeFile.set`
 * verstimmt ihn hinter dem Rücken.
 */
export const navHistoryState = writable({ canBack: false, canForward: false });

/** `file: null` ist die Startseite. `state` hält, wie die Ansicht beim Verlassen aussah. */
export interface HistoryItem {
  file: FileEntry | null;
  state?: ViewState;
}

const LIMIT = 50;

let backStack: HistoryItem[] = [];
let forwardStack: HistoryItem[] = [];
let current: HistoryItem = { file: null };

function sync(): void {
  navHistoryState.set({ canBack: backStack.length > 0, canForward: forwardStack.length > 0 });
}

function sameLocation(a: FileEntry | null, b: FileEntry | null): boolean {
  return a === b || (!!a && !!b && a.path === b.path && a.type === b.type);
}

/** Derselbe Ort wie der aktive wird ersetzt, sonst sammelt Doppelklicken Leerlauf. */
export function pushHistory(file: FileEntry | null, state?: ViewState): HistoryItem {
  if (sameLocation(current.file, file)) {
    current = { file, state: state ?? current.state };
    return current;
  }
  backStack.push(current);
  if (backStack.length > LIMIT) backStack.shift();
  forwardStack = [];
  current = { file, state };
  sync();
  return current;
}

/** Hält fest, wie der aktive Ort gerade aussieht — vor jedem Verlassen. */
export function setHistoryState(state: ViewState): void {
  current.state = state;
}

/** Umbenennen und Speichern-unter: derselbe Eintrag unter neuem Pfad. */
export function replaceHistory(file: FileEntry): void {
  current = { ...current, file };
}

/** Aktives Ziel ist weg (gelöscht, Neuanlage verworfen): an seine Stelle tritt die Startseite. */
export function dropHistoryCurrent(): void {
  current = { file: null };
}

/**
 * Nächstes erreichbares Ziel in Richtung `dir` (−1 zurück, +1 vor). Was `reachable`
 * ablehnt, fällt aus dem Verlauf, statt als Fehlerkarte zu landen.
 */
export async function stepHistory(
  dir: -1 | 1,
  reachable: (file: FileEntry | null) => Promise<boolean>,
): Promise<HistoryItem | null> {
  const from = dir === -1 ? backStack : forwardStack;
  while (from.length) {
    const candidate = dir === -1 ? from.pop()! : from.shift()!;
    if (!(await reachable(candidate.file))) continue;
    if (dir === -1) forwardStack.unshift(current);
    else backStack.push(current);
    current = candidate;
    sync();
    return candidate;
  }
  sync();
  return null;
}
