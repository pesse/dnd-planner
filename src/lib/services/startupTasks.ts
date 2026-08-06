/** Was einmalig beim App-Start läuft; zurück kommt der Teardown der Fehlerlauscher. */
import { invoke } from '@tauri-apps/api/core';
import { invalidateVault } from '../stores/campaign';
import { confirmAction } from '../stores/confirmDialog';
import { pushError } from '../stores/errors';
import { checkLibrariesOnStartup } from '../stores/libraries';
import { checkForUpdate } from '../stores/update';
import { legacyCharacterDirs, migrateCharacterUids } from './migrateCharacterUids';
import { getRulesIndex } from './rulesReference';

async function maybeMigrateLegacyVault(): Promise<void> {
  try {
    const legacy = await invoke<{ path: string; files: number; target: string } | null>(
      'find_legacy_vault',
    );
    if (!legacy) return;

    const ok = await confirmAction({
      title: 'Alte Vault-Daten gefunden',
      message:
        `In einem früheren Installationsverzeichnis wurden ${legacy.files} Datei(en) gefunden:\n` +
        `${legacy.path}\n\n` +
        `In den aktuellen Vault übernehmen? Die Originaldaten bleiben als Backup erhalten.`,
      confirmLabel: 'Übernehmen',
    });
    if (!ok) return;

    const res = await invoke<{ copied: number; skipped: number }>('migrate_legacy_vault', {
      source: legacy.path,
    });
    invalidateVault();

    await confirmAction({
      title: 'Migration abgeschlossen',
      message:
        `${res.copied} Datei(en) übernommen` +
        (res.skipped ? `, ${res.skipped} bereits vorhanden und übersprungen` : '') +
        '.',
      confirmLabel: 'OK',
    });
  } catch (e) {
    pushError(`Vault-Migration fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
  }
}

async function maybeMigrateCharacterUids(): Promise<void> {
  try {
    const legacy = await legacyCharacterDirs();
    if (legacy.length === 0) return;

    const ok = await confirmAction({
      title: 'Charakterordner umstellen',
      message:
        `${legacy.length} Charakterordner sind noch nach dem Charakternamen benannt. Dadurch ` +
        `überschreiben sich gleichnamige Charaktere und eine Namensänderung passt nicht ` +
        `zum Ordner.\n\n` +
        `Auf feste IDs umstellen? Verweise in Kampagnen und Sitzungen werden mitgezogen.`,
      confirmLabel: 'Umstellen',
    });
    if (!ok) return;

    const res = await migrateCharacterUids();
    invalidateVault();

    if (res.failed.length) pushError(`Nicht umgestellt:\n${res.failed.join('\n')}`);
    await confirmAction({
      title: 'Umstellung abgeschlossen',
      message:
        `${res.renamed} Charakter(e) umgestellt` +
        (res.filesUpdated ? `, ${res.filesUpdated} Datei(en) mit Verweisen aktualisiert` : '') +
        '.',
      confirmLabel: 'OK',
    });
  } catch (e) {
    pushError(`Umstellung der Charakterordner fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Beim Abbruch eines Stream-Requests räumt das Tauri-HTTP-Plugin die Body-Ressource
 * doppelt ab; die zweite Rejection landet als unhandled. Solche Teardown-Rennen dürfen
 * keinen Toast erzeugen, echte Fehler schon.
 */
const isBenignAbortNoise = (msg: string): boolean =>
  msg === 'Request cancelled' || /the resource id \d+ is invalid/i.test(msg);

export function runStartupTasks(): () => void {
  // Alles hier `void`: der Cleanup-Return wird synchron erwartet und darf nicht warten.
  void invoke<string>('get_current_dir').then((cwd) => console.log('Tauri CWD:', cwd));
  // Reihenfolge zählt: die Legacy-Migration kann selbst noch namensbenannte Ordner einspielen.
  void maybeMigrateLegacyVault().then(maybeMigrateCharacterUids);
  void checkForUpdate();

  // Installiert offene Bibliotheken gleich mit, damit eine frische Installation ohne
  // Zugangscode brauchbar ist. Updates nie ungefragt — dafür gibt es den Badge.
  void checkLibrariesOnStartup();

  // Den Regel-Suchindex nach dem ersten Paint vorwärmen, sonst startet die erste
  // `search_rules`-Abfrage im KI-Panel kalt.
  setTimeout(() => getRulesIndex(), 0);

  function onError(e: ErrorEvent) {
    pushError(e.message || String(e));
  }
  function onUnhandled(e: PromiseRejectionEvent) {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    if (isBenignAbortNoise(msg)) {
      e.preventDefault();
      return;
    }
    pushError(msg);
  }

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandled);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandled);
  };
}
