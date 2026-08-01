/**
 * Was einmalig beim App-Start läuft. Liefert die Aufräumfunktion für die
 * Fenster-Fehlerlauscher zurück.
 */
import { invoke } from '@tauri-apps/api/core';
import { invalidateVault } from '../stores/campaign';
import { confirmAction } from '../stores/confirmDialog';
import { pushError } from '../stores/errors';
import { checkLibrariesOnStartup } from '../stores/libraries';
import { checkForUpdate } from '../stores/update';
import { getRulesIndex } from './rulesReference';

/**
 * Prüft, ob in einem früheren Installationsverzeichnis noch Vault-Daten liegen,
 * und bietet den Umzug an. Die Originaldaten bleiben als Backup erhalten.
 */
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

/**
 * Wird ein laufender Stream-Request abgebrochen (z.B. beim Schließen des
 * Charakter-Wizards, der KI-Jobs nebenläufig fährt), räumt der Tauri-HTTP-Plugin
 * die Body-Ressource doppelt ab: das zweite `fetch_cancel_body` läuft ins Leere
 * und der Plugin `void`t die Rejection → sie landet als unhandled. Diese
 * Teardown-Rennen sind bedeutungslos; nur echte Fehler sollen einen Toast erzeugen.
 */
const isBenignAbortNoise = (msg: string): boolean =>
  msg === 'Request cancelled' || /the resource id \d+ is invalid/i.test(msg);

export function runStartupTasks(): () => void {
  // Debug-CWD asynchron loggen, ohne den (synchron erwarteten) Cleanup-Return zu blockieren
  void invoke<string>('get_current_dir').then((cwd) => console.log('Tauri CWD:', cwd));

  // Auf verwaiste Vault-Daten aus früheren Versionen prüfen (No-op im Dev/Browser).
  void maybeMigrateLegacyVault();

  // Beim Start einmalig auf eine neuere Version prüfen (No-op außerhalb von Tauri).
  void checkForUpdate();

  // Bibliotheksverzeichnis prüfen. Offene, noch nicht vorhandene Bibliotheken
  // werden dabei installiert, damit eine frische Installation ohne
  // Zugangscode sofort brauchbar ist. Updates nie ungefragt — dafür der Badge.
  void checkLibrariesOnStartup();

  // Regel-Suchindex (MiniSearch) einmalig vorwärmen, damit die erste
  // search_rules-Abfrage im KI-Panel nicht kalt startet. Nach dem ersten Paint.
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
