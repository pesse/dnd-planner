import { writable } from 'svelte/store';
import { pushError } from './errors';

export type UpdateStatus = 'idle' | 'available' | 'downloading' | 'installing' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  /** Neue Version laut Manifest, sobald ein Update gefunden wurde. */
  version?: string;
  /** Release-Notes (Markdown/Plaintext aus dem Release). */
  notes?: string;
  /** Download-Fortschritt 0..1, falls die Gesamtgröße bekannt ist. */
  progress?: number;
}

export const updateState = writable<UpdateState>({ status: 'idle' });

/** Sichtbarkeit des Update-Dialogs (Badge öffnet, „Später"/Abschluss schließt). */
export const updateDialogOpen = writable<boolean>(false);

/** Hält das vom Plugin gelieferte Update-Objekt zwischen Prüfung und Installation. */
let pending: import('@tauri-apps/plugin-updater').Update | null = null;

/** True, wenn wir innerhalb der Tauri-Runtime laufen (nicht im reinen Vite-Browser-Dev). */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Prüft beim Start, ob eine neuere Version vorliegt. No-op außerhalb von Tauri.
 * Setzt bei Treffer status='available' + Versionsinfo; Fehler landen still im Toast.
 */
export async function checkForUpdate(): Promise<void> {
  if (!inTauri()) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      pending = update;
      updateState.set({ status: 'available', version: update.version, notes: update.body });
    }
  } catch (e) {
    // Beim Start nicht aufdringlich: Netz-/Manifest-Fehler nur in die Konsole.
    console.warn('Update-Prüfung fehlgeschlagen:', e);
  }
}

/**
 * Lädt das gefundene Update herunter, installiert es und startet die App neu.
 * Zeigt Download-Fortschritt; Fehler werden als Toast gemeldet.
 */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  let total = 0;
  let received = 0;
  updateState.update((s) => ({ ...s, status: 'downloading', progress: 0 }));
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0;
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength;
        if (total > 0) {
          updateState.update((s) => ({ ...s, status: 'downloading', progress: received / total }));
        }
      } else if (event.event === 'Finished') {
        updateState.update((s) => ({ ...s, status: 'installing', progress: 1 }));
      }
    });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushError(`Update fehlgeschlagen: ${msg}`);
    updateState.set({ status: 'error' });
  }
}

/** Dialog schließen („Später"); der Badge bleibt sichtbar, status unverändert. */
export function dismissUpdate(): void {
  updateDialogOpen.set(false);
}
