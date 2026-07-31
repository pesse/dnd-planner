import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { pushError } from './errors';
import { invalidateVault } from './campaign';
import { invalidateSpellLibrary } from '../spellLibrary';
import { invalidateClassCache, invalidateClassFeatureCache } from '../classLibrary';
import { invalidateSpeciesCache } from '../speciesLibrary';
import { invalidateFeatsCache } from '../featsLibrary';
import { invalidateBackgroundsCache } from '../backgroundsLibrary';
import { invalidateItemCache } from '../itemLibrary';
import { invalidateMonsterPaths } from './context';

/**
 * Zustand einer verteilten Bibliothek.
 *
 * - `installed`  aktuelle Fassung liegt im Vault
 * - `update`     neuere Fassung verfügbar
 * - `available`  noch nicht installiert, aber zugänglich
 * - `locked`      geschützt, kein Zugangscode hinterlegt
 * - `staleCode`   hinterlegter Code gehört zu einer älteren Passwortfassung
 * - `appOutdated` die Fassung verlangt eine neuere App (`minVersion`)
 */
export type LibraryState =
  | 'installed'
  | 'update'
  | 'available'
  | 'locked'
  | 'staleCode'
  | 'appOutdated';

export interface Library {
  id: string;
  name: string;
  description?: string;
  license: string;
  protected: boolean;
  version: string;
  size: number;
  fileCount: number;
  status: LibraryState;
  installedVersion?: string;
  /** App-Version, die diese Fassung mindestens verlangt (nur wenn deklariert). */
  minVersion?: string;
}

export interface InstallSummary {
  written: number;
  skippedModified: number;
  removed: number;
  needsAdopt: number;
}

export const libraries = writable<Library[]>([]);
export const librariesLoading = writable(false);
export const libraryManagerOpen = writable(false);

/** ids, für die gerade eine Installation läuft. */
export const installing = writable<Set<string>>(new Set());

/** True, wenn wir innerhalb der Tauri-Runtime laufen (nicht im Vite-Browser-Dev). */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Anzahl Bibliotheken mit verfügbarem Update — speist den Sidebar-Badge. */
export function updateCount(list: Library[]): number {
  return list.filter((l) => l.status === 'update').length;
}

/**
 * Holt das Bibliotheksverzeichnis. Beim Start bewusst still: ohne Netz soll
 * die App normal starten, der Fehler landet nur in der Konsole.
 */
export async function refreshLibraries(silent = true): Promise<void> {
  if (!inTauri()) return;
  librariesLoading.set(true);
  try {
    libraries.set(await invoke<Library[]>('fetch_library_index'));
  } catch (e) {
    if (silent) {
      console.warn('Bibliotheksverzeichnis nicht erreichbar:', e);
    } else {
      pushError(`Bibliotheken konnten nicht geladen werden: ${e}`);
    }
  } finally {
    librariesLoading.set(false);
  }
}

/**
 * Löst einen Zugangscode ein.
 *
 * Der Nutzer weiß in der Regel nicht, zu welcher Bibliothek sein Code gehört —
 * deshalb wird er gegen alle geschützten Packs geprüft. Rückgabe sind die
 * Namen der entsperrten Bibliotheken.
 */
export async function redeemAccessCode(code: string): Promise<string[]> {
  const unlocked = await invoke<string[]>('try_access_code', { code });
  await refreshLibraries(false);
  return unlocked;
}

/**
 * Installiert bzw. aktualisiert eine Bibliothek.
 *
 * Trifft die Installation auf vorhandene, aber nicht von uns verwaltete
 * Dateien (Bestandsinstallation), schreibt sie nichts und meldet `needsAdopt`.
 * Die Oberfläche fragt dann nach und ruft erneut mit `adopt = true`.
 */
export async function installLibrary(id: string, adopt = false): Promise<InstallSummary> {
  installing.update((s) => new Set(s).add(id));
  try {
    const summary = await invoke<InstallSummary>('install_library', { id, adopt });
    if (summary.written > 0 || summary.removed > 0) {
      invalidateLibraryCaches();
    }
    await refreshLibraries(false);
    return summary;
  } finally {
    installing.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }
}

/** Zusammengefasstes Ergebnis über mehrere Bibliotheken. */
export interface BatchResult {
  written: number;
  skippedModified: number;
  removed: number;
  /** Bibliotheken, die auf Bestandsdateien getroffen sind (id → Anzahl). */
  needsAdopt: Record<string, number>;
  /** Bibliotheken, bei denen etwas schiefging (id → Meldung). */
  failed: Record<string, string>;
}

/**
 * Installiert mehrere Bibliotheken nacheinander.
 *
 * Bewusst sequentiell: die Packs schreiben in denselben Vault, und die
 * Fortschrittsanzeige bleibt so nachvollziehbar. Ein Fehlschlag bei einer
 * Bibliothek bricht die übrigen nicht ab — er landet in `failed`.
 */
export async function installMany(ids: string[], adopt = false): Promise<BatchResult> {
  const result: BatchResult = {
    written: 0,
    skippedModified: 0,
    removed: 0,
    needsAdopt: {},
    failed: {},
  };

  for (const id of ids) {
    try {
      const s = await installLibrary(id, adopt);
      result.written += s.written;
      result.skippedModified += s.skippedModified;
      result.removed += s.removed;
      if (s.needsAdopt > 0 && !adopt) result.needsAdopt[id] = s.needsAdopt;
    } catch (e) {
      result.failed[id] = `${e}`;
    }
  }
  return result;
}

/** Entfernt einen gespeicherten Zugangscode; installierte Inhalte bleiben. */
export async function forgetAccessCode(id: string): Promise<void> {
  await invoke('forget_access_code', { id });
  await refreshLibraries(false);
}

/**
 * Entwertet alle Bibliotheks-Caches, damit frisch installierte Inhalte sofort
 * sichtbar sind. `invalidateVault` weckt zusätzlich die Sidebar-Listen.
 */
function invalidateLibraryCaches(): void {
  invalidateSpellLibrary();
  invalidateClassCache();
  invalidateClassFeatureCache();
  invalidateSpeciesCache();
  invalidateFeatsCache();
  invalidateBackgroundsCache();
  invalidateItemCache();
  invalidateMonsterPaths();
  invalidateVault();
}

/**
 * Prüft beim Start auf neue Fassungen und installiert offene Bibliotheken,
 * die noch gar nicht vorliegen — damit eine frische Installation ohne
 * Zugangscode sofort brauchbar ist. Updates werden nie ungefragt gezogen;
 * dafür gibt es den Badge.
 */
export async function checkLibrariesOnStartup(): Promise<void> {
  if (!inTauri()) return;
  await refreshLibraries(true);

  const outdated = get(libraries).filter((l) => l.status === 'appOutdated');
  for (const lib of outdated) {
    console.info(
      `Bibliothek "${lib.name}" verlangt App-Version ${lib.minVersion} oder neuer — ` +
        'übersprungen. Bereits installierte Inhalte bleiben nutzbar.',
    );
  }

  const missing = get(libraries).filter((l) => !l.protected && l.status === 'available');
  for (const lib of missing) {
    try {
      const summary = await installLibrary(lib.id, false);
      if (summary.needsAdopt > 0) {
        // Bestandsdateien vorgefunden — nicht ungefragt überschreiben.
        console.info(
          `Bibliothek "${lib.name}": ${summary.needsAdopt} vorhandene Datei(en) ` +
            'ohne Verwaltung — Übernahme im Bibliotheks-Dialog bestätigen.',
        );
      }
    } catch (e) {
      console.warn(`Bibliothek "${lib.name}" nicht installierbar:`, e);
    }
  }
}
