/**
 * Lädt und cached den Hintergrund-Bibliotheks-Index aus `vault/backgrounds`
 * (flach). Analog zu `speciesLibrary.ts`. `list_json_files` liefert `[]` bei
 * fehlendem Ordner → keine Fehler, wenn die Bibliothek noch leer ist.
 */
import { invoke } from '@tauri-apps/api/core';
import { parseBackground } from './utils/schemaValidation';
import type { Background } from './schemas/background';

export const BACKGROUNDS_PATH = './vault/backgrounds';

export interface BackgroundInfo {
  name: string;
  nameDe?: string;
  path: string;
  /** Bibliotheks-Key des Hintergrunds, z.B. "srd-2024_soldier" oder "phb-2024_…". */
  key?: string;
}

/** Zeigt den deutschen Namen, falls vorhanden, sonst den Originalnamen. */
export function backgroundDisplayName(info: BackgroundInfo): string {
  return info.nameDe ?? info.name;
}

// Singleton-Cache
let cache: BackgroundInfo[] | null = null;

export function invalidateBackgroundsCache(): void {
  cache = null;
}

/** Lädt alle Hintergründe der Bibliothek (mit Cache). */
export async function getBackgroundsList(): Promise<BackgroundInfo[]> {
  if (cache) return cache;
  try {
    const files = await invoke<string[]>('list_json_files', { path: BACKGROUNDS_PATH });
    const backgrounds = await Promise.all(
      files.map(async (filename) => {
        const path = `${BACKGROUNDS_PATH}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          return { name: data.name ?? filename.replace('.json', ''), nameDe: data.nameDe, path, key: data.key };
        } catch {
          return { name: filename.replace('.json', ''), path };
        }
      })
    );
    backgrounds.sort((a, b) => backgroundDisplayName(a).localeCompare(backgroundDisplayName(b), 'de'));
    cache = backgrounds;
    return backgrounds;
  } catch {
    cache = [];
    return [];
  }
}

/**
 * Lädt den vollen Hintergrund (inkl. Vorteile) aus der lokalen Bibliothek per Key.
 * null = nicht lokal vorhanden / unparsebar. Analog zu `getSpeciesByKey`.
 */
export async function getBackgroundByKey(key: string): Promise<Background | null> {
  if (!key) return null;
  try {
    const info = (await getBackgroundsList()).find((b) => b.key === key);
    if (!info) return null;
    const data = JSON.parse(await invoke<string>('read_file_content', { path: info.path }));
    const r = parseBackground(data);
    return r.ok ? r.data : null;
  } catch {
    return null;
  }
}

/** Sucht Hintergründe nach Name (deutsch zuerst, dann Original als Fallback). */
export function searchBackgrounds(
  library: BackgroundInfo[],
  query: string,
  maxResults = 10,
): BackgroundInfo[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results = library.filter((b) => {
    const primary = (b.nameDe ?? b.name).toLowerCase();
    return primary.includes(q) || b.name.toLowerCase().includes(q);
  });
  results.sort((a, b) => {
    const aName = backgroundDisplayName(a).toLowerCase();
    const bName = backgroundDisplayName(b).toLowerCase();
    const aStart = aName.startsWith(q);
    const bStart = bName.startsWith(q);
    if (aStart !== bStart) return aStart ? -1 : 1;
    return aName.localeCompare(bName, 'de');
  });
  return results.slice(0, maxResults);
}
