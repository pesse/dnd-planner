/** Manuelle Prüfung auf App- und Bibliotheks-Updates; meldet auch „nichts Neues". */
import { get, writable } from 'svelte/store';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from './httpFetch';
import { findUpdate, updateDialogOpen } from '../stores/update';
import {
  describeUpdates,
  libraries,
  libraryManagerOpen,
  pendingUpdates,
  refreshLibraries,
} from '../stores/libraries';
import { pushError, pushNotice } from '../stores/toasts';

export const checkingForNews = writable(false);

/** `null`: Prüfung gescheitert, der Fehler ist schon gemeldet. */
async function checkApp(): Promise<boolean | null> {
  try {
    return await findUpdate();
  } catch (e) {
    pushError(`App-Update-Prüfung fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function checkForNews(): Promise<void> {
  if (!isTauri()) {
    pushNotice('Die Update-Prüfung gibt es nur in der Desktop-App.');
    return;
  }
  if (get(checkingForNews)) return;
  checkingForNews.set(true);
  try {
    const [appUpdate, libsLoaded] = await Promise.all([checkApp(), refreshLibraries(false)]);
    const libUpdates = pendingUpdates(get(libraries));

    if (libUpdates.length) {
      pushNotice(describeUpdates(libUpdates), {
        label: 'Bibliotheken öffnen',
        run: () => libraryManagerOpen.set(true),
      });
    }
    if (appUpdate) updateDialogOpen.set(true);
    else if (appUpdate === false && libsLoaded && !libUpdates.length) {
      pushNotice(
        import.meta.env.DEV
          ? 'Bibliotheken auf dem neuesten Stand. App-Updates prüft nur der Release-Build.'
          : `Alles aktuell — DnD Planner v${await getVersion()}, Bibliotheken auf dem neuesten Stand.`,
      );
    }
  } finally {
    checkingForNews.set(false);
  }
}
