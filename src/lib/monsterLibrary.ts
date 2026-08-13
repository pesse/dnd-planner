/**
 * Auflösung eines Monster-Slugs auf seinen Pfad in der globalen Bibliothek — und die
 * Namenssuche darüber, die seit dem Wegfall der dnd5eapi-Anbindung die einzige
 * Monsterquelle ist: „Neues Monster"-Dialog und KI-Tools lesen beide von hier.
 */
import { invoke } from '@tauri-apps/api/core';
import { parseMonster } from './utils/schemaValidation';
import { scanJsonFolder } from './services/library/createLibrary';
import { memoOnce } from './services/library/memo';
import type { Monster } from './types';

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

export interface MonsterLibraryHit {
  slug: string;
  path: string;
  monster: Monster;
}

/** Unlesbare und unparsebare Dateien fallen still weg; sichtbar bleiben sie in der Seitenleiste. */
async function readMonsterFolder(dir: string): Promise<MonsterLibraryHit[]> {
  const hits = await scanJsonFolder<MonsterLibraryHit | null>(
    dir,
    (data, { path, filename }) => {
      const parsed = parseMonster(data);
      return parsed.ok ? { slug: filename.replace(/\.json$/, ''), path, monster: parsed.data } : null;
    },
    () => null,
  ).catch(() => [] as (MonsterLibraryHit | null)[]);
  return hits.filter((hit): hit is MonsterLibraryHit => hit !== null);
}

/** Flach und in den Typ-Unterordnern, ein Invoke je Ordner. */
const library = memoOnce(async (): Promise<MonsterLibraryHit[]> => {
  const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', {
    path: MONSTERS_PATH,
  }).catch(() => [] as { name: string; is_dir: boolean }[]);
  const dirs = entries.filter((e) => e.is_dir).map((e) => `${MONSTERS_PATH}/${e.name}`);
  return (await Promise.all([MONSTERS_PATH, ...dirs].map(readMonsterFolder))).flat();
});

/** Nach einer Bibliotheks- oder Dateiänderung; sonst bleibt ein neues Monster unsichtbar. */
export const invalidateMonsterLibrary = library.invalidate;

/** Alle Bibliotheksmonster, geparst und gecacht. */
export const getMonsterLibrary = library.get;

/** Sucht über deutschen und englischen Namen sowie den Slug. */
export async function searchMonsterLibrary(query: string, limit = 8): Promise<MonsterLibraryHit[]> {
  const q = query.trim().toLowerCase();
  const lib = await getMonsterLibrary();
  if (!q) return lib.slice(0, limit);
  return lib
    .filter(
      (hit) =>
        hit.monster.name.toLowerCase().includes(q) ||
        hit.monster.name_en.toLowerCase().includes(q) ||
        hit.slug.includes(q),
    )
    .slice(0, limit);
}
