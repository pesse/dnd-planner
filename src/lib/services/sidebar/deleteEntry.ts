import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
import { activeFile, setFileContent, vaultVersion } from '../../stores/campaign';
import { confirmAction } from '../../stores/confirmDialog';
import { pushError } from '../../stores/toasts';

/**
 * Löscht einen Vault-Eintrag (Datei oder Ordner) nach Bestätigung und ruft die
 * passende Reload-Funktion. Räumt activeFile auf, falls der gelöschte Eintrag
 * (oder ein Kind davon) gerade geöffnet ist.
 */
export async function deleteEntry(
  path: string,
  displayName: string,
  isFolder: boolean,
  reload: () => void | Promise<void>,
): Promise<void> {
  const ok = await confirmAction({
    title: 'Löschen',
    message: isFolder
      ? `„${displayName}" und der gesamte enthaltene Inhalt werden unwiderruflich gelöscht.`
      : `„${displayName}" wird unwiderruflich gelöscht.`,
    confirmLabel: 'Löschen',
    danger: true,
  });
  if (!ok) return;
  try {
    await invoke('delete_path', { path });
  } catch (e) {
    pushError(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const af = get(activeFile);
  const affected = (p?: string) => !!p && (p === path || p.startsWith(path + '/'));
  if (af && (affected(af.path) || affected(af.dirPath))) {
    activeFile.set(null);
    setFileContent('');
  }
  await reload();
  vaultVersion.update((v) => v + 1);
}
