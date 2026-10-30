import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from '../services/httpFetch';
import { pushError, pushNotice } from './toasts';
import { invalidateLibraryCaches } from '../services/library/invalidate';

export type InstallState = 'installed' | 'update' | 'available';

/** `locked` = kein Zugangscode hinterlegt, `staleCode` = der hinterlegte gehört zu einer
 * älteren Passwortfassung, `appOutdated` = die Fassung verlangt eine neuere App. */
export type BlockReason = 'locked' | 'staleCode' | 'appOutdated';

export interface Library {
  id: string;
  name: string;
  description?: string;
  license: string;
  protected: boolean;
  version: string;
  size: number;
  fileCount: number;
  /** Installationsstand — unabhängig davon, ob `block` das Ziehen gerade verhindert. */
  install: InstallState;
  block?: BlockReason;
  /** Der installierte Inhalt ist älter als diese App ihn liest; Aktualisieren behebt es. */
  contentOutdated: boolean;
  installedVersion?: string;
  minVersion?: string;
  /** Bilder-Library: id des Pakets, dessen optionaler Zusatz sie ist. */
  artOf?: string;
}

/** Rohform von `fetch_library_index` — `status` ist dort die Rust-seitige Prioritätskette. */
interface RawLibraryStatus {
  id: string;
  name: string;
  description?: string;
  license: string;
  protected: boolean;
  version: string;
  size: number;
  fileCount: number;
  status: string;
  contentOutdated: boolean;
  installedVersion?: string;
  minVersion?: string;
  artOf?: string;
}

const BLOCK_REASONS: ReadonlySet<string> = new Set<BlockReason>(['locked', 'staleCode', 'appOutdated']);

/**
 * Rust liefert `status` bereits als Prioritätskette (ein Sperrgrund verdrängt den
 * Installationsstand). Der Installationsstand lässt sich trotzdem verlustfrei aus
 * `installedVersion`/`version` rekonstruieren — hier, statt zwei Achsen im Rust-Modell.
 */
function toLibrary(raw: RawLibraryStatus): Library {
  const install: InstallState = !raw.installedVersion
    ? 'available'
    : raw.installedVersion === raw.version
      ? 'installed'
      : 'update';
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    license: raw.license,
    protected: raw.protected,
    version: raw.version,
    size: raw.size,
    fileCount: raw.fileCount,
    install,
    block: BLOCK_REASONS.has(raw.status) ? (raw.status as BlockReason) : undefined,
    contentOutdated: raw.contentOutdated,
    installedVersion: raw.installedVersion,
    minVersion: raw.minVersion,
    artOf: raw.artOf,
  };
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

export const installing = writable<Set<string>>(new Set());

/** `unpack` (Entschlüsseln, Prüfen) meldet keinen Zähler, `total` ist dort 0. */
export interface InstallProgress {
  phase: 'download' | 'unpack' | 'write';
  done: number;
  total: number;
}

/** Je laufender Installation; verschwindet, sobald sie fertig ist. */
export const installProgress = writable<Record<string, InstallProgress>>({});

let progressListener: Promise<unknown> | null = null;

function listenToProgress(): Promise<unknown> {
  progressListener ??= listen<InstallProgress & { id: string }>('library-install-progress', ({ payload }) => {
    const { id, ...progress } = payload;
    // Ein Event, das nach dem Abschluss eintrifft, ließe einen Balken stehen.
    if (!get(installing).has(id)) return;
    installProgress.update((all) => ({ ...all, [id]: progress }));
  });
  return progressListener;
}

/** Anteil 0…1 über alle Phasen; der Download dominiert, Schreiben ist der Rest. */
export function progressShare(p: InstallProgress | undefined): number {
  if (!p) return 0;
  const share = p.total > 0 ? p.done / p.total : 0;
  return p.phase === 'download' ? share * 0.8 : p.phase === 'unpack' ? 0.8 : 0.8 + share * 0.2;
}

export const PHASE_LABEL: Record<InstallProgress['phase'], string> = {
  download: 'Lade herunter',
  unpack: 'Entpacke',
  write: 'Schreibe Dateien',
};

/** Was der Nutzer jetzt ziehen könnte — Badge und Start-Hinweis müssen dieselbe Menge meinen. */
export function pendingUpdates(list: Library[]): Library[] {
  return list.filter((l) => l.install === 'update' && !l.block);
}

export function updateCount(list: Library[]): number {
  return pendingUpdates(list).length;
}

/** Beim Start bewusst still: ohne Netz soll die App trotzdem normal starten. */
export async function refreshLibraries(silent = true): Promise<boolean> {
  if (!isTauri()) return false;
  librariesLoading.set(true);
  try {
    libraries.set((await invoke<RawLibraryStatus[]>('fetch_library_index')).map(toLibrary));
    return true;
  } catch (e) {
    if (silent) {
      console.warn('Bibliotheksverzeichnis nicht erreichbar:', e);
    } else {
      pushError(`Bibliotheken konnten nicht geladen werden: ${e}`);
    }
    return false;
  } finally {
    librariesLoading.set(false);
  }
}

/**
 * Der Nutzer weiß meist nicht, zu welcher Bibliothek sein Code gehört — deshalb wird er
 * gegen alle geschützten Packs geprüft.
 */
export async function redeemAccessCode(code: string): Promise<string[]> {
  const unlocked = await invoke<string[]>('try_access_code', { code });
  await refreshLibraries(false);
  return unlocked;
}

/**
 * Trifft die Installation auf fremde Bestandsdateien, schreibt sie NICHTS und meldet
 * `needsAdopt`; die Oberfläche fragt nach und ruft erneut mit `adopt = true`.
 */
export async function installLibrary(id: string, adopt = false): Promise<InstallSummary> {
  installing.update((s) => new Set(s).add(id));
  try {
    await listenToProgress();
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
    installProgress.update((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
  }
}

export interface BatchResult {
  written: number;
  skippedModified: number;
  removed: number;
  needsAdopt: Record<string, number>;
  failed: Record<string, string>;
}

/**
 * Bewusst sequentiell: die Packs schreiben in denselben Vault. Ein Fehlschlag bricht die
 * übrigen nicht ab, er landet in `failed`.
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

/** Installierte Inhalte bleiben. */
export async function forgetAccessCode(id: string): Promise<void> {
  await invoke('forget_access_code', { id });
  await refreshLibraries(false);
}

export function describeUpdates(list: Library[]): string {
  if (list.length === 1) {
    const [lib] = list;
    return `Neue Fassung von „${lib.name}“ verfügbar (${lib.installedVersion} → ${lib.version}).`;
  }
  const names = list.map((l) => `„${l.name}“`).join(', ');
  return `Für ${list.length} Bibliotheken liegen neue Fassungen bereit: ${names}.`;
}

/**
 * Installiert nur noch gar nicht vorliegende, offene Bibliotheken — damit eine frische
 * Installation sofort brauchbar ist. UPDATES werden nie ungefragt gezogen, dafür Badge und
 * Hinweis.
 */
export async function checkLibrariesOnStartup(): Promise<void> {
  if (!isTauri()) return;
  await refreshLibraries(true);

  const outdated = get(libraries).filter((l) => l.block === 'appOutdated');
  for (const lib of outdated) {
    console.info(
      `Bibliothek "${lib.name}" verlangt App-Version ${lib.minVersion} oder neuer — ` +
        'übersprungen. Bereits installierte Inhalte bleiben nutzbar.',
    );
  }

  // Sichtbar, nicht als Konsolen-Notiz: hier fehlt dem Nutzer Mechanik, und das Aktualisieren
  // ist die Handlung. Updates zieht die App weiterhin nie ungefragt.
  const stale = get(libraries).filter((l) => l.contentOutdated);
  if (stale.length) {
    pushError(
      `Der installierte Inhalt von ${stale.map((l) => `„${l.name}"`).join(', ')} ist älter als ` +
        'diese App-Version — Zauber und Mechaniken können fehlen. Im Bibliotheks-Dialog aktualisieren.',
    );
  }

  // Der Badge trägt das Signal dauerhaft, aber leicht zu übersehen; einmal pro Start steht es
  // hier sichtbar. Gezogen wird trotzdem erst auf Anforderung.
  const updates = pendingUpdates(get(libraries));
  if (updates.length) {
    pushNotice(describeUpdates(updates), {
      label: 'Bibliotheken öffnen',
      run: () => libraryManagerOpen.set(true),
    });
  }

  const missing = get(libraries).filter((l) => !l.protected && !l.block && l.install === 'available');
  for (const lib of missing) {
    try {
      const summary = await installLibrary(lib.id, false);
      if (summary.needsAdopt > 0) {
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
