/**
 * Umbenennen der offenen Datei. Vier Wege, weil vier Dinge im Vault verschieden
 * heißen: Kampagne und Akt sind Verzeichnisse, Gegenstände JSON, der Rest Markdown.
 */
import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
import { activeCampaign, activeFile, invalidateVault } from '../stores/campaign';
import { confirmAction } from '../stores/confirmDialog';
import { pushError } from '../stores/errors';
import { invalidateItemCache } from '../itemLibrary';
import type { FileEntry } from '../types';
import { slugKeepUmlauts } from '../utils/text';

/** Startwert des Eingabefelds: der Name ohne die Endung, die der Typ mitbringt. */
export function renameStartValue(file: FileEntry | null): string {
  if (file?.type === 'campaign') return get(activeCampaign)?.name ?? '';
  if (file?.type === 'item') return file.name?.replace(/\.json$/, '') ?? '';
  return file?.name?.replace('.md', '') ?? '';
}

export async function renameFile(file: FileEntry, value: string): Promise<void> {
  if (file.type === 'campaign') {
    const newName = value.trim();
    const newSlug = slugKeepUmlauts(newName);
    const campaign = get(activeCampaign);
    if (!campaign || newSlug === campaign.path) return;

    const oldFolder = `./vault/campaigns/${campaign.path}`;
    const newFolder = `./vault/campaigns/${newSlug}`;
    const newFilePath = `${newFolder}/campaign.md`;

    try {
      await invoke('rename_file', { oldPath: oldFolder, newPath: newFolder });
      activeCampaign.set({ ...campaign, path: newSlug, name: newName });
      activeFile.set({ ...file, path: newFilePath });
      invalidateVault();
    } catch (e) {
      await confirmAction({
        title: 'Umbenennen fehlgeschlagen',
        message: `${e}`,
        confirmLabel: 'OK',
      });
    }
    return;
  }

  if (file.type === 'item') {
    const slug = slugKeepUmlauts(value);
    const newName = `${slug}.json`;
    if (!slug || newName === file.name) return;

    const dir = file.path.substring(0, file.path.lastIndexOf('/'));
    const newPath = `${dir}/${newName}`;
    const itemDir = dir.split('/').pop() ?? '';

    try {
      await invoke('rename_file', { oldPath: file.path, newPath });
      activeFile.set({ ...file, name: newName, path: newPath });
      if (itemDir) invalidateItemCache(itemDir);
      invalidateVault();
    } catch (e) {
      pushError(`Umbenennen fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }

  if (file.type === 'act') {
    // Akte sind Verzeichnisse — das Verzeichnis umbenennen, index.md bleibt
    const newSlug = slugKeepUmlauts(value);
    const oldActDir = file.path.substring(0, file.path.lastIndexOf('/index.md'));
    const actsDir = oldActDir.substring(0, oldActDir.lastIndexOf('/'));
    const newActDir = `${actsDir}/${newSlug}`;
    if (newActDir === oldActDir) return;

    try {
      await invoke('rename_file', { oldPath: oldActDir, newPath: newActDir });
      activeFile.set({ ...file, name: newSlug, path: `${newActDir}/index.md` });
      invalidateVault();
    } catch (e) {
      console.error('Umbenennen fehlgeschlagen:', e);
    }
    return;
  }

  const newName = value.trim() + '.md';
  if (newName === file.name) return;

  const dir = file.path.substring(0, file.path.lastIndexOf('/'));
  const newPath = `${dir}/${newName}`;

  try {
    await invoke('rename_file', { oldPath: file.path, newPath });
    activeFile.set({ ...file, name: newName, path: newPath });
    invalidateVault();
  } catch (e) {
    console.error('Umbenennen fehlgeschlagen:', e);
  }
}
