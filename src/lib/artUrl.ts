/** Bilder liegen unter `vault/art/` und kommen aus den Bild-Bibliotheken; `name` ohne Endung. */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { isTauri } from './services/httpFetch';

// Ohne Tauri (Browser-Dev, Tests) liefert Vite `vault/art` unter `/art` aus.
let vaultArtDir: string | null = null;

/** Muss vor dem ersten `artUrl` laufen — sonst zeigen die URLs in den Browser-Pfad. */
export async function initArtBase(): Promise<void> {
  if (isTauri()) vaultArtDir = await invoke<string>('get_absolute_path', { path: './vault/art' });
}

export const artUrl = (name: string): string =>
  vaultArtDir ? convertFileSrc(`${vaultArtDir}/${name}.avif`) : `/art/${name}.avif`;
