/**
 * Auflösung eines Monster-Slugs auf seinen Pfad in der globalen Bibliothek.
 */
import { invoke } from '@tauri-apps/api/core';

export const MONSTERS_PATH = './vault/monsters';

/**
 * Ein Monster liegt flach ODER in einem Typ-Unterordner — beides in dieser Reihenfolge, damit
 * ein flacher Treffer die Gruppen nicht erst listen muss. Wer nur den flachen Pfad probiert,
 * findet gruppierte Monster nie; genau so war der Encounter-Druck kaputt.
 */
export async function globalMonsterCandidates(slug: string): Promise<string[]> {
  const paths = [`${MONSTERS_PATH}/${slug}.json`];
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: MONSTERS_PATH });
    for (const e of entries) if (e.is_dir) paths.push(`${MONSTERS_PATH}/${e.name}/${slug}.json`);
  } catch { /* Verzeichnisliste nicht verfügbar → nur flacher Pfad */ }
  return paths;
}

/** Erster lesbarer Kandidat, oder null. */
export async function findGlobalMonsterPath(slug: string): Promise<string | null> {
  for (const path of await globalMonsterCandidates(slug)) {
    try {
      await invoke<string>('read_file_content', { path });
      return path;
    } catch { /* nicht hier */ }
  }
  return null;
}
