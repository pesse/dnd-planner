import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { Campaign, FileEntry, Item } from '../types';

export const activeCampaign = writable<Campaign | null>(null);

/**
 * Noch nicht gespeicherter Gegenstand (KI- oder manuelle Anlage). Ist er gesetzt,
 * zeigt die ItemCard ihn direkt im Bearbeiten-Modus; erst beim Speichern wird die
 * Datei angelegt. `dir` = Zielkategorie (Ordnername).
 */
export const newItemDraft = writable<{ item: Item; dir: string } | null>(null);

/** Increment to signal that vault files have changed (e.g. after an agent write). */
export const vaultVersion = writable(0);
export function invalidateVault() { vaultVersion.update((v) => v + 1); }
export const openFiles = writable<FileEntry[]>([]);
export const activeFile = writable<FileEntry | null>(null);
export const fileContent = writable<string>('');

// Reaktiver State für Undo/Redo-Buttons
export const historyState = writable({ canUndo: false, canRedo: false });

const HISTORY_LIMIT = 20;
const _undoStack: string[] = [];
const _redoStack: string[] = [];

function syncHistoryState() {
  historyState.set({ canUndo: _undoStack.length > 0, canRedo: _redoStack.length > 0 });
}

async function persistContent(content: string) {
  const file = get(activeFile);
  if (!file?.path || file.type === 'character') return;
  await invoke('write_file_content', { path: file.path, content }).catch(console.error);
}

/** Setzt fileContent ohne Undo-Eintrag (z.B. beim Laden einer Datei). */
export function setFileContent(content: string) {
  _undoStack.length = 0;
  _redoStack.length = 0;
  syncHistoryState();
  fileContent.set(content);
}

/** LLM-Ergebnis anhängen. Vorheriger Stand wird gesichert. */
export function appendContent(text: string) {
  _undoStack.push(get(fileContent));
  if (_undoStack.length > HISTORY_LIMIT) _undoStack.shift();
  _redoStack.length = 0;
  const next = get(fileContent) ? `${get(fileContent)}\n\n---\n\n${text}` : text;
  fileContent.set(next);
  syncHistoryState();
  persistContent(next);
}

/** LLM-Ergebnis ersetzt den gesamten Inhalt. Vorheriger Stand wird gesichert. */
export function replaceContent(text: string) {
  _undoStack.push(get(fileContent));
  if (_undoStack.length > HISTORY_LIMIT) _undoStack.shift();
  _redoStack.length = 0;
  fileContent.set(text);
  syncHistoryState();
  persistContent(text);
}

/** Macht den letzten append/replace rückgängig. */
export function undoContent() {
  if (_undoStack.length === 0) return;
  _redoStack.push(get(fileContent));
  const prev = _undoStack.pop()!;
  fileContent.set(prev);
  syncHistoryState();
  persistContent(prev);
}

/** Stellt den zuletzt rückgängig gemachten Stand wieder her. */
export function redoContent() {
  if (_redoStack.length === 0) return;
  _undoStack.push(get(fileContent));
  const next = _redoStack.pop()!;
  fileContent.set(next);
  syncHistoryState();
  persistContent(next);
}
