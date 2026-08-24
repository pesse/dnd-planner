/**
 * Die eine Durchreiche für „Eintrag öffnen": Navigations-Guard, `activeFile`, die
 * Seiteneffekte des Typs und der Verlauf. Wer `activeFile` direkt setzt, umgeht ihn.
 */
import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
import { activeCampaign, activeFile, setFileContent } from '../stores/campaign';
import { confirmNavigation } from '../stores/navigationGuard';
import { loadActSummaries } from '../stores/context';
import {
  dropHistoryCurrent,
  pushHistory,
  replaceHistory,
  stepHistory,
} from '../stores/navigationHistory';
import type { FileEntry } from '../types';

const MARKDOWN_TYPES = new Set<FileEntry['type']>(['campaign', 'act', 'session', 'world', 'notes']);

/** Karten-Typen laden über `activeFile` selbst, Verzeichnis-Charaktere über `dirPath`. */
function needsMarkdown(entry: FileEntry): boolean {
  return MARKDOWN_TYPES.has(entry.type) || (entry.type === 'character' && !entry.dirPath);
}

async function apply(entry: FileEntry): Promise<void> {
  activeFile.set(entry);

  if (needsMarkdown(entry)) {
    try {
      setFileContent(await invoke<string>('read_file_content', { path: entry.path }));
    } catch (e) {
      setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  } else if (entry.type === 'character') {
    setFileContent('');
  }

  if (entry.type === 'act') {
    const campaign = get(activeCampaign);
    if (campaign) loadActSummaries(campaign.path);
  }
}

/**
 * @param guard `false`, wenn der Aufrufer `confirmNavigation` schon selbst geführt hat.
 * @returns false, wenn der Guard abgebrochen hat — der Aufrufer bleibt dann stehen.
 */
export async function navigateTo(entry: FileEntry, opts?: { guard?: boolean }): Promise<boolean> {
  if (opts?.guard !== false && !(await confirmNavigation())) return false;
  pushHistory(entry);
  await apply(entry);
  return true;
}

/** Umbenennen und Speichern-unter: derselbe Eintrag, neuer Pfad, kein Verlaufseintrag. */
export function replaceActive(entry: FileEntry): void {
  replaceHistory(entry);
  activeFile.set(entry);
}

/** Gelöscht oder Neuanlage verworfen: nichts mehr offen, der Zurück-Weg bleibt. */
export function closeActive(): void {
  dropHistoryCurrent();
  activeFile.set(null);
  setFileContent('');
}

async function reachable(entry: FileEntry): Promise<boolean> {
  if (!entry.path) return false;
  try {
    await invoke<string>('read_file_content', { path: entry.path });
    return true;
  } catch {
    return false;
  }
}

async function step(dir: -1 | 1): Promise<void> {
  if (!(await confirmNavigation())) return;
  const target = await stepHistory(dir, reachable);
  if (target) await apply(target);
}

export const navigateBack = (): Promise<void> => step(-1);
export const navigateForward = (): Promise<void> => step(1);
