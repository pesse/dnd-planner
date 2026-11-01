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
  setHistoryState,
  stepHistory,
  type HistoryItem,
} from '../stores/navigationHistory';
import { activePeek } from './entryPeek';
import { arrive, captureViewState, type ViewState } from './viewState';
import type { FileEntry } from '../types';

const MARKDOWN_TYPES = new Set<FileEntry['type']>(['campaign', 'act', 'session', 'world', 'notes']);

/** Karten-Typen laden über `activeFile` selbst, Verzeichnis-Charaktere über `dirPath`. */
function needsMarkdown(entry: FileEntry): boolean {
  return MARKDOWN_TYPES.has(entry.type) || (entry.type === 'character' && !entry.dirPath);
}

async function apply({ file: entry, state }: HistoryItem): Promise<void> {
  arrive(state ?? {});
  activeFile.set(entry);
  if (!entry) {
    setFileContent('');
    return;
  }

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
 * @param leavePeek `true`, wenn der Nutzer das Verlassen eines Assistenten bestätigt hat.
 * @param state Zustand, mit dem das Ziel öffnet, statt seiner Vorgabe.
 * @returns false, wenn der Guard abgebrochen hat — der Aufrufer bleibt dann stehen.
 */
export async function navigateTo(
  entry: FileEntry,
  opts?: { guard?: boolean; leavePeek?: boolean; state?: ViewState },
): Promise<boolean> {
  const peek = activePeek();
  if (peek && !opts?.leavePeek) {
    peek(entry);
    return false;
  }
  if (opts?.guard !== false && !(await confirmNavigation())) return false;
  setHistoryState(captureViewState());
  await apply(pushHistory(entry, opts?.state));
  return true;
}

/** Umbenennen und Speichern-unter: derselbe Eintrag, neuer Pfad, kein Verlaufseintrag. */
export function replaceActive(entry: FileEntry): void {
  replaceHistory(entry);
  activeFile.set(entry);
}

/** Gelöscht oder Neuanlage verworfen: die Startseite tritt an seine Stelle, der Zurück-Weg bleibt. */
export function closeActive(): void {
  dropHistoryCurrent();
  arrive({});
  activeFile.set(null);
  setFileContent('');
}

export async function navigateHome(): Promise<void> {
  if (!get(activeFile) || !(await confirmNavigation())) return;
  setHistoryState(captureViewState());
  await apply(pushHistory(null));
}

async function reachable(entry: FileEntry | null): Promise<boolean> {
  if (!entry || entry.type === 'catalog') return true;
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
  setHistoryState(captureViewState());
  const target = await stepHistory(dir, reachable);
  if (target) await apply(target);
}

export const navigateBack = (): Promise<void> => step(-1);
export const navigateForward = (): Promise<void> => step(1);
