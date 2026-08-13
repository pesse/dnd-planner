/**
 * Auflösung eines Monster-Slugs auf seinen Pfad in der globalen Bibliothek — und die
 * Namenssuche darüber, die seit dem Wegfall der dnd5eapi-Anbindung die einzige
 * Monsterquelle ist: „Neues Monster"-Dialog und KI-Tools lesen beide von hier.
 */
import { invoke } from '@tauri-apps/api/core';
import { parseMonster } from './utils/schemaValidation';
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

let cache: MonsterLibraryHit[] | null = null;

/** Nach einer Bibliotheks- oder Dateiänderung; sonst bleibt ein neues Monster unsichtbar. */
export const invalidateMonsterLibrary = (): void => {
  cache = null;
};

/** Jede Monsterdatei des Vaults, flach und in den Typ-Unterordnern. */
export async function allMonsterPaths(): Promise<string[]> {
  const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: MONSTERS_PATH });
  const paths = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => `${MONSTERS_PATH}/${e.name}`);
  for (const dir of entries.filter((e) => e.is_dir)) {
    const files = await invoke<string[]>('list_json_files', { path: `${MONSTERS_PATH}/${dir.name}` }).catch(
      () => [] as string[],
    );
    paths.push(...files.map((f) => `${MONSTERS_PATH}/${dir.name}/${f}`));
  }
  return paths;
}

/** Alle Bibliotheksmonster, geparst und gecacht. Unlesbare Dateien fallen still weg. */
export async function getMonsterLibrary(): Promise<MonsterLibraryHit[]> {
  if (cache) return cache;
  const loaded = await Promise.all(
    (await allMonsterPaths()).map(async (path) => {
      try {
        const parsed = parseMonster(JSON.parse(await invoke<string>('read_file_content', { path })));
        if (!parsed.ok) return null;
        return { slug: path.split('/').pop()!.replace(/\.json$/, ''), path, monster: parsed.data };
      } catch {
        return null;
      }
    }),
  );
  cache = loaded.filter((hit): hit is MonsterLibraryHit => hit !== null);
  return cache;
}

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
