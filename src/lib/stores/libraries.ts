import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../services/httpFetch';
import { pushError } from './errors';
import { invalidateVault } from './campaign';
import { invalidateSpellLibrary } from '../spellLibrary';
import { invalidateClassCache } from '../classLibrary';
import { invalidateSpeciesCache } from '../speciesLibrary';
import { invalidateFeatsCache } from '../featsLibrary';
import { invalidateBackgroundsCache } from '../backgroundsLibrary';
import { invalidateItemCache } from '../itemLibrary';
import { invalidateMonsterPaths } from '../services/contextLoad';

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

export function updateCount(list: Library[]): number {
  return list.filter((l) => l.install === 'update' && !l.block).length;
}

/** Beim Start bewusst still: ohne Netz soll die App trotzdem normal starten. */
export async function refreshLibraries(silent = true): Promise<void> {
  if (!isTauri()) return;
  librariesLoading.set(true);
  try {
    libraries.set((await invoke<RawLibraryStatus[]>('fetch_library_index')).map(toLibrary));
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

/** `invalidateVault` weckt zusätzlich die Sidebar-Listen. */
function invalidateLibraryCaches(): void {
  invalidateSpellLibrary();
  invalidateClassCache();
  invalidateSpeciesCache();
  invalidateFeatsCache();
  invalidateBackgroundsCache();
  invalidateItemCache();
  invalidateMonsterPaths();
  invalidateVault();
}

/**
 * Installiert nur noch gar nicht vorliegende, offene Bibliotheken — damit eine frische
 * Installation sofort brauchbar ist. UPDATES werden nie ungefragt gezogen, dafür der Badge.
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
