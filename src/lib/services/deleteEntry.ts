import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
import { activeCampaign, activeFile, vaultVersion } from '../stores/campaign';
import { closeActive } from './navigation';
import { confirmAction } from '../stores/confirmDialog';
import { pushError } from '../stores/toasts';
import type { FileEntry } from '../types';

const parentDir = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** Kampagne und Akt sind Ordner, geöffnet wird nur ihre `campaign.md` / `index.md` darin. */
function deleteTargetOf(file: FileEntry): { path: string; isFolder: boolean } {
  if (file.type === 'character' && file.dirPath) return { path: file.dirPath, isFolder: true };
  if (file.type === 'campaign' || file.type === 'act') return { path: parentDir(file.path), isFolder: true };
  return { path: file.path, isFolder: false };
}

/**
 * Löscht den gerade geöffneten Eintrag nach Bestätigung und schließt ihn. Die Seitenleiste
 * lädt über `vaultVersion` nach.
 */
export async function deleteActiveEntry(displayName: string): Promise<void> {
  const file = get(activeFile);
  if (!file) return;
  const { path, isFolder } = deleteTargetOf(file);
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
  closeActive();
  if (file.type === 'campaign') activeCampaign.set(null);
  vaultVersion.update((v) => v + 1);
}
