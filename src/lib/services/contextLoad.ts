/**
 * Die Vault-Lader des LLM-Kontexts: lesen per `invoke()` und geben Daten zurück.
 * Kein Store-Zugriff — eingetragen werden die Ergebnisse in `stores/context.ts`.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Monster } from '../types';
import { normalizeMonster, normalizeCharacter } from '../utils/schemaValidation';
import { characterMinimum } from './characterContext';
import type {
  ActSummaryEntry,
  CharacterCompact,
  EncounterSummaryEntry,
  MonsterLibraryEntry,
} from './contextTypes';
import { extractActSummary, extractActTitle } from '../utils/actExtract';
import { parseFrontmatter } from '../utils/frontmatter';

export function fetchCampaignContent(campaignPath: string): Promise<string> {
  return invoke<string>('read_file_content', {
    path: `./vault/campaigns/${campaignPath}/campaign.md`,
  });
}

export async function fetchCampaignParty(campaignMd: string): Promise<CharacterCompact[]> {
  const { frontmatter } = parseFrontmatter(campaignMd);
  const slugs = frontmatter.characters ?? [];
  if (slugs.length === 0) return [];
  const results = await Promise.all(
    slugs.map(async (slug): Promise<CharacterCompact | null> => {
      try {
        const raw = await invoke<string>('read_file_content', {
          path: `./vault/characters/${slug}/character.json`,
        });
        // Über `normalizeCharacter` statt roher Feldzugriffe: nur so gewinnen die Links
        // vor den abgeleiteten Freitext-Strings.
        return characterMinimum(normalizeCharacter(JSON.parse(raw)), slug);
      } catch {
        return null;
      }
    })
  );
  return results.filter((c): c is CharacterCompact => c !== null);
}

async function readMonsterEntry(path: string, group: string, filename: string): Promise<MonsterLibraryEntry> {
  const slug = filename.replace('.json', '');
  try {
    const content = await invoke<string>('read_file_content', { path });
    const m = JSON.parse(content);
    return { slug, name: m.name as string, cr: m.cr as string, size: m.size as string, type: m.type as string, group: m.type as string || group };
  } catch {
    return { slug, name: slug, cr: '?', size: '?', type: '?', group };
  }
}

/** Über alle Typ-Unterordner UND die flach abgelegten Root-Dateien. */
export async function fetchMonsterLibrary(): Promise<MonsterLibraryEntry[]> {
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: './vault/monsters' });
    const groups = entries.filter((e) => e.is_dir).map((e) => e.name);
    const rootFiles = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => e.name);

    const groupedEntries = await Promise.all(
      groups.flatMap(async (group) => {
        try {
          const files = await invoke<string[]>('list_json_files', { path: `./vault/monsters/${group}` });
          return Promise.all(files.map((f) => readMonsterEntry(`./vault/monsters/${group}/${f}`, group, f)));
        } catch { return []; }
      })
    );
    const rootEntries = await Promise.all(
      rootFiles.map((f) => readMonsterEntry(`./vault/monsters/${f}`, 'Sonstige', f))
    );
    return [...groupedEntries.flat(), ...rootEntries];
  } catch {
    return [];
  }
}

/** Akt-lokale Monster überschreiben die globalen Einträge für diesen Akt. */
async function actMonsterOverrides(
  campaignPath: string,
  actDirName: string,
  libraryMap: Map<string, { name: string; cr: string }>,
): Promise<Map<string, { name: string; cr: string }>> {
  const actMap = new Map(libraryMap);
  try {
    const localFiles = await invoke<string[]>('list_json_files', {
      path: `./vault/campaigns/${campaignPath}/acts/${actDirName}/monsters`,
    });
    await Promise.all(
      localFiles.map(async (filename) => {
        const slug = filename.replace('.json', '');
        try {
          const content = await invoke<string>('read_file_content', {
            path: `./vault/campaigns/${campaignPath}/acts/${actDirName}/monsters/${filename}`,
          });
          const m = JSON.parse(content);
          actMap.set(slug, { name: m.name as string, cr: m.cr as string });
        } catch { /* ignorieren */ }
      })
    );
  } catch { /* kein lokaler monsters-Ordner */ }
  return actMap;
}

async function readActEncounters(
  campaignPath: string,
  actDirName: string,
  actMap: Map<string, { name: string; cr: string }>,
): Promise<EncounterSummaryEntry[]> {
  try {
    const files = await invoke<string[]>('list_json_files', {
      path: `./vault/campaigns/${campaignPath}/acts/${actDirName}/encounters`,
    });
    return await Promise.all(
      files.map(async (filename) => {
        const path = `./vault/campaigns/${campaignPath}/acts/${actDirName}/encounters/${filename}`;
        const content = await invoke<string>('read_file_content', { path });
        const enc = JSON.parse(content);
        const monsterList = (enc.monsters as Array<{ count: number; slug: string }>)
          .map((m) => {
            const lib = actMap.get(m.slug);
            const label = lib ? `${lib.name} (CR ${lib.cr})` : m.slug;
            return `${m.count}× ${label}`;
          })
          .join(', ');
        return {
          slug: filename.replace('.json', ''),
          actSlug: actDirName,
          name: enc.name as string,
          difficulty: enc.difficulty as string,
          xpTotal: enc.xp_total as number,
          monsterList,
          status: (enc.status as 'planned' | 'done' | 'skipped') ?? 'planned',
        };
      })
    );
  } catch {
    return []; // Akt hat noch keine Encounters
  }
}

/** Encounter-Summaries aller Akte; `library` liefert Name+CR für die Monsterliste. */
export async function fetchEncounterSummaries(
  campaignPath: string,
  library: MonsterLibraryEntry[],
): Promise<EncounterSummaryEntry[]> {
  const libraryMap = new Map(library.map((m) => [m.slug, { name: m.name, cr: m.cr }]));
  try {
    const actEntries = await invoke<{ name: string; is_dir: boolean }[]>('list_entries', {
      path: `./vault/campaigns/${campaignPath}/acts`,
    });
    const actDirs = actEntries.filter((e) => e.is_dir).map((e) => e.name);

    const allEncounters: EncounterSummaryEntry[] = [];
    for (const actDirName of actDirs) {
      const actMap = await actMonsterOverrides(campaignPath, actDirName, libraryMap);
      allEncounters.push(...(await readActEncounters(campaignPath, actDirName, actMap)));
    }
    return allEncounters;
  } catch {
    return [];
  }
}

/**
 * Slug → Dateipfad, lazy über alle Typ-Unterordner und die Root-Dateien. Wer ein
 * globales Monster anlegt, muss `invalidateMonsterPaths()` rufen.
 */
let monsterPathCache: Map<string, string> | null = null;

export function invalidateMonsterPaths(): void {
  monsterPathCache = null;
}

async function buildMonsterPathCache(): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: './vault/monsters' });
    for (const e of entries) {
      if (!e.is_dir && e.name.endsWith('.json')) cache.set(e.name.replace('.json', ''), `./vault/monsters/${e.name}`);
    }
    const dirs = entries.filter((e) => e.is_dir).map((e) => e.name);
    await Promise.all(
      dirs.map(async (dir) => {
        try {
          const files = await invoke<string[]>('list_json_files', { path: `./vault/monsters/${dir}` });
          for (const f of files) cache.set(f.replace('.json', ''), `./vault/monsters/${dir}/${f}`);
        } catch { /* Ordner nicht lesbar */ }
      }),
    );
  } catch { /* vault/monsters nicht vorhanden */ }
  return cache;
}

/** Egal, in welchem Typ-Unterordner es liegt. */
async function readGlobalMonster(slug: string): Promise<string | null> {
  if (!monsterPathCache) monsterPathCache = await buildMonsterPathCache();
  const path = monsterPathCache.get(slug);
  if (!path) return null;
  try {
    return await invoke<string>('read_file_content', { path });
  } catch {
    return null;
  }
}

/** Reihenfolge: akt-lokal (`acts/{akt}/monsters/`) schlägt global (`vault/monsters/`). */
export async function fetchEncounterMonsters(encounterContent: string, encounterPath?: string): Promise<Monster[]> {
  const actMonsterBase = encounterPath
    ? encounterPath.replace(/\/encounters\/[^/]+\.json$/, '/monsters')
    : null;

  try {
    const enc = JSON.parse(encounterContent) as { monsters: Array<{ slug: string }> };
    const defs = await Promise.all(
      enc.monsters.map(async (m) => {
        if (actMonsterBase) {
          try {
            const content = await invoke<string>('read_file_content', { path: `${actMonsterBase}/${m.slug}.json` });
            return normalizeMonster(JSON.parse(content) as Monster);
          } catch { /* nicht gefunden, global versuchen */ }
        }
        const content = await readGlobalMonster(m.slug);
        return content ? normalizeMonster(JSON.parse(content) as Monster) : null;
      })
    );
    return defs.filter((d): d is Monster => d !== null);
  } catch {
    return [];
  }
}

export async function fetchActSummaries(campaignPath: string): Promise<ActSummaryEntry[]> {
  try {
    const actEntries = await invoke<{ name: string; is_dir: boolean }[]>('list_entries', {
      path: `./vault/campaigns/${campaignPath}/acts`,
    });
    const actDirs = actEntries.filter((e) => e.is_dir).map((e) => e.name);
    return await Promise.all(
      actDirs.map(async (dirName) => {
        const path = `./vault/campaigns/${campaignPath}/acts/${dirName}/index.md`;
        const content = await invoke<string>('read_file_content', { path });
        return {
          name: dirName,
          title: extractActTitle(content),
          summary: extractActSummary(content),
          path,
        };
      })
    );
  } catch {
    return [];
  }
}
