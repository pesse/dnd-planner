import { writable } from 'svelte/store';
import { isTauri } from '../services/httpFetch';
import { pushError } from './toasts';

export type UpdateStatus = 'idle' | 'available' | 'downloading' | 'installing' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  notes?: string;
  /** Download-Fortschritt 0..1, falls die Gesamtgröße bekannt ist. */
  progress?: number;
}

export const updateState = writable<UpdateState>({ status: 'idle' });

export const updateDialogOpen = writable<boolean>(false);

/** Hält das vom Plugin gelieferte Update-Objekt zwischen Prüfung und Installation. */
let pending: import('@tauri-apps/plugin-updater').Update | null = null;

/** Wirft bei Netz-/Manifest-Fehlern; `true`, wenn ein Update bereitliegt. */
export async function findUpdate(): Promise<boolean> {
  // Der Dev-Build hinkt nach jedem Release bis zum Pull des Release-Bumps hinterher — ohne
  // diese Sperre böte er an, den Installer über die Entwicklungsumgebung zu ziehen.
  if (!isTauri() || import.meta.env.DEV) return false;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return false;
  pending = update;
  updateState.set({ status: 'available', version: update.version, notes: update.body });
  return true;
}

export async function checkForUpdate(): Promise<void> {
  try {
    await findUpdate();
  } catch (e) {
    // Beim Start nicht aufdringlich: Netz-/Manifest-Fehler nur in die Konsole.
    console.warn('Update-Prüfung fehlgeschlagen:', e);
  }
}

/** Endet im Erfolgsfall in `relaunch()` — die App startet neu, nichts danach läuft noch. */
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
