import { derived, writable, get, type Writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { activeFile, activeCampaign, fileContent } from './campaign';
import type { FileEntry, Monster } from '../types';
import { normalizeMonster, normalizeCharacter } from '../utils/schemaValidation';
import {
  characterMinimum,
  buildCharacterContextFromRaw,
  loadCharacterNotes,
  characterDirOf,
  CHARACTER_CONTEXT_LABELS,
  type CharacterContextLevel,
  type CharacterNotes,
} from '../services/characterContext';
import { buildSystemPrompt } from '../services/contextPrompt';
import type {
  ActSummaryEntry,
  CharacterCompact,
  ContextFlags,
  EncounterSummaryEntry,
  MonsterLibraryEntry,
  PinDetailLevel,
  PinnedEntry,
} from '../services/contextTypes';
import { extractActSummary, extractActTitle } from '../utils/actExtract';
import { parseFrontmatter } from '../utils/frontmatter';

const FLAG_DEFAULTS: ContextFlags = {
  campaign: true,
  characters: true,
  acts: true,
  encounters: true,
  monsterGroups: [],
  encounterMonsters: true,
  activeFile: true,
};

function createContextFlags(): Writable<ContextFlags> {
  let initial = FLAG_DEFAULTS;
  try {
    const saved = localStorage.getItem('context-flags');
    if (saved) {
      // Merge mit Defaults: neue Felder bekommen ihren Default-Wert
      initial = { ...FLAG_DEFAULTS, ...JSON.parse(saved) };
    }
  } catch { /* kein localStorage (z.B. SSR) oder ungültiges JSON */ }

  const store = writable<ContextFlags>(initial);
  store.subscribe((flags) => {
    try { localStorage.setItem('context-flags', JSON.stringify(flags)); } catch { /* ignore */ }
  });
  return store;
}

export const contextFlags = createContextFlags();

export const pinnedEntries = writable<PinnedEntry[]>([]);

/**
 * Gepufferte, voll aufgelöste Charakter-Kontextblöcke je `character.json`-Pfad. Weil
 * die Merkmalstexte im Vault liegen, ist ihr Aufbau asynchron — `systemPrompt` (ein
 * synchrones `derived`) liest deshalb nur diese Map, die `refreshCharacterContexts`
 * füllt.
 */
export const characterContextBlocks = writable<Map<string, string>>(new Map());

/** Akt-Summaries der aktiven Kampagne — wird beim Kampagnen-Wechsel geladen. */
export const actSummaries = writable<ActSummaryEntry[]>([]);

/** Inhalt der campaign.md der aktiven Kampagne. */
export const campaignContent = writable<string>('');

/** Geladene Charakterdaten aus dem Frontmatter der campaign.md. */
export const campaignCharacterData = writable<CharacterCompact[]>([]);

export async function loadCampaignContent(campaignPath: string): Promise<void> {
  try {
    const content = await invoke<string>('read_file_content', {
      path: `./vault/campaigns/${campaignPath}/campaign.md`,
    });
    campaignContent.set(content);
    await loadCampaignCharacters(content);
  } catch {
    campaignContent.set('');
    campaignCharacterData.set([]);
  }
}

/** Neu-laden der Charakterdaten aus einem gegebenen campaign.md-Inhalt (z.B. nach Frontmatter-Edit). */
export async function reloadCampaignCharacters(campaignMd: string): Promise<void> {
  campaignContent.set(campaignMd);
  await loadCampaignCharacters(campaignMd);
}

async function loadCampaignCharacters(campaignMd: string): Promise<void> {
  const { frontmatter } = parseFrontmatter(campaignMd);
  const slugs = frontmatter.characters ?? [];
  if (slugs.length === 0) {
    campaignCharacterData.set([]);
    return;
  }
  const results = await Promise.all(
    slugs.map(async (slug): Promise<CharacterCompact | null> => {
      try {
        const raw = await invoke<string>('read_file_content', {
          path: `./vault/characters/${slug}/character.json`,
        });
        // Über normalizeCharacter statt roher Feldzugriffe: bevorzugt die Links
        // (classes/species/backgroundRef) und fällt auf die abgeleiteten Strings zurück.
        return characterMinimum(normalizeCharacter(JSON.parse(raw)), slug);
      } catch {
        return null;
      }
    })
  );
  campaignCharacterData.set(results.filter((c): c is CharacterCompact => c !== null));
}

/** Encounter-Summaries der aktiven Kampagne. */
export const encounterSummaries = writable<EncounterSummaryEntry[]>([]);

/** Kondensierte Monster-Bibliothek (Name, CR, Größe, Typ). */
export const monsterLibrary = writable<MonsterLibraryEntry[]>([]);

/** Vollständige Monster-Definitionen für den aktuell geöffneten Encounter. */
export const encounterMonsterDefs = writable<Monster[]>([]);

/** Lädt Encounter-Summaries und Monster-Namen für eine Kampagne. */
export async function loadEncounterContext(campaignPath: string): Promise<void> {
  invalidateMonsterPaths(); // Slug→Pfad-Cache neu aufbauen (Vault kann sich geändert haben)
  // Monster-Bibliothek zuerst laden, damit Encounter-Listen Name+CR anreichern können
  let libraryMap = new Map<string, { name: string; cr: string }>();
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: './vault/monsters' });
    const groups = entries.filter((e) => e.is_dir).map((e) => e.name);
    const rootFiles = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => e.name);

    async function loadMonsterFile(path: string, group: string, filename: string): Promise<MonsterLibraryEntry> {
      const slug = filename.replace('.json', '');
      try {
        const content = await invoke<string>('read_file_content', { path });
        const m = JSON.parse(content);
        return { slug, name: m.name as string, cr: m.cr as string, size: m.size as string, type: m.type as string, group: m.type as string || group };
      } catch {
        return { slug, name: slug, cr: '?', size: '?', type: '?', group };
      }
    }

    const groupedEntries = await Promise.all(
      groups.flatMap(async (group) => {
        try {
          const files = await invoke<string[]>('list_json_files', { path: `./vault/monsters/${group}` });
          return Promise.all(files.map((f) => loadMonsterFile(`./vault/monsters/${group}/${f}`, group, f)));
        } catch { return []; }
      })
    );
    const rootEntries = await Promise.all(
      rootFiles.map((f) => loadMonsterFile(`./vault/monsters/${f}`, 'Sonstige', f))
    );

    const library = [...groupedEntries.flat(), ...rootEntries];
    monsterLibrary.set(library);
    libraryMap = new Map(library.map((m) => [m.slug, { name: m.name, cr: m.cr }]));
  } catch {
    monsterLibrary.set([]);
  }

  try {
    const actEntries = await invoke<{ name: string; is_dir: boolean }[]>('list_entries', {
      path: `./vault/campaigns/${campaignPath}/acts`,
    });
    const actDirs = actEntries.filter((e) => e.is_dir).map((e) => e.name);

    const allEncounters: EncounterSummaryEntry[] = [];
    for (const actDirName of actDirs) {
      // Akt-lokale Monster laden (überschreiben globale Einträge für diesen Akt)
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

      try {
        const files = await invoke<string[]>('list_json_files', {
          path: `./vault/campaigns/${campaignPath}/acts/${actDirName}/encounters`,
        });
        const actEncounters = await Promise.all(
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
        allEncounters.push(...actEncounters);
      } catch { /* Akt hat noch keine Encounters */ }
    }
    encounterSummaries.set(allEncounters);
  } catch {
    encounterSummaries.set([]);
  }
}

/**
 * Slug → Dateipfad der globalen Monster (über ALLE Typ-Unterordner + Root von
 * vault/monsters/). Lazy gebaut und gecacht; via `invalidateMonsterPaths()`
 * verwerfen, wenn neue globale Monster angelegt wurden.
 */
let monsterPathCache: Map<string, string> | null = null;

export function invalidateMonsterPaths(): void {
  monsterPathCache = null;
}

async function buildMonsterPathCache(): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: './vault/monsters' });
    // Root-Dateien (flach abgelegt)
    for (const e of entries) {
      if (!e.is_dir && e.name.endsWith('.json')) cache.set(e.name.replace('.json', ''), `./vault/monsters/${e.name}`);
    }
    // Typ-Unterordner (humanoide/, tiere/, …)
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

/** Liest ein globales Monster anhand seines Slugs — egal in welchem Typ-Unterordner. */
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

/** Lädt die vollständigen Monster-Definitionen für einen geöffneten Encounter.
 *  Lookup-Reihenfolge: akt-lokal (acts/{akt}/monsters/) → global (vault/monsters/<typ>/)
 */
export async function loadEncounterMonsters(encounterContent: string, encounterPath?: string): Promise<void> {
  // Akt-lokalen Monsters-Ordner aus dem Encounter-Pfad ableiten
  const actMonsterBase = encounterPath
    ? encounterPath.replace(/\/encounters\/[^/]+\.json$/, '/monsters')
    : null;

  try {
    const enc = JSON.parse(encounterContent) as { monsters: Array<{ slug: string }> };
    const defs = await Promise.all(
      enc.monsters.map(async (m) => {
        // Akt-lokal zuerst
        if (actMonsterBase) {
          try {
            const content = await invoke<string>('read_file_content', { path: `${actMonsterBase}/${m.slug}.json` });
            return normalizeMonster(JSON.parse(content) as Monster);
          } catch { /* nicht gefunden, global versuchen */ }
        }
        // Global fallback: alle Typ-Unterordner durchsuchen
        const content = await readGlobalMonster(m.slug);
        return content ? normalizeMonster(JSON.parse(content) as Monster) : null;
      })
    );
    encounterMonsterDefs.set(defs.filter((d): d is Monster => d !== null));
  } catch {
    encounterMonsterDefs.set([]);
  }
}

/** Lädt alle Akt-Summaries für eine Kampagne. Aufruf beim Kampagnen-Wechsel. */
export async function loadActSummaries(campaignPath: string): Promise<void> {
  try {
    const actEntries = await invoke<{ name: string; is_dir: boolean }[]>('list_entries', {
      path: `./vault/campaigns/${campaignPath}/acts`,
    });
    const actDirs = actEntries.filter((e) => e.is_dir).map((e) => e.name);
    const entries = await Promise.all(
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
    actSummaries.set(entries);
  } catch {
    actSummaries.set([]);
  }
}

export const systemPrompt = derived(
  [activeFile, activeCampaign, fileContent, pinnedEntries, actSummaries, encounterSummaries, monsterLibrary, encounterMonsterDefs, campaignContent, contextFlags, campaignCharacterData, characterContextBlocks],
  ([$activeFile, $activeCampaign, $fileContent, $pinnedEntries, $actSummaries, $encounterSummaries, $monsterLibrary, $encounterMonsterDefs, $campaignContent, $contextFlags, $campaignCharacterData, $characterContextBlocks]) =>
    buildSystemPrompt({
      activeFile: $activeFile,
      activeCampaign: $activeCampaign,
      fileContent: $fileContent,
      pinnedEntries: $pinnedEntries,
      actSummaries: $actSummaries,
      encounterSummaries: $encounterSummaries,
      monsterLibrary: $monsterLibrary,
      encounterMonsterDefs: $encounterMonsterDefs,
      campaignContent: $campaignContent,
      flags: $contextFlags,
      party: $campaignCharacterData,
      characterBlocks: $characterContextBlocks,
    }),
);

export const contextSummary = derived(
  [activeFile, activeCampaign, pinnedEntries, actSummaries, encounterSummaries, monsterLibrary, encounterMonsterDefs, contextFlags],
  ([$activeFile, $activeCampaign, $pinnedEntries, $actSummaries, $encounterSummaries, $monsterLibrary, $encounterMonsterDefs, $contextFlags]) => {
    const items: string[] = [];
    if ($activeCampaign && $contextFlags.campaign) items.push($activeCampaign.name);
    if ($actSummaries.length > 0 && $contextFlags.acts) items.push(`${$actSummaries.length} Akte`);
    if ($encounterSummaries.length > 0 && $contextFlags.encounters) items.push(`${$encounterSummaries.length} Encounters`);
    if ($contextFlags.monsterGroups.length > 0) {
      const count = $monsterLibrary.filter((m) => $contextFlags.monsterGroups.includes(m.group)).length;
      items.push(`${count} Monster`);
    }
    if ($encounterMonsterDefs.length > 0 && $contextFlags.encounterMonsters && $activeFile?.type === 'encounter') items.push(`${$encounterMonsterDefs.length} Mon↑`);
    if ($activeFile && $contextFlags.activeFile && $activeFile.type !== 'notes') items.push($activeFile.name);
    for (const pin of $pinnedEntries) {
      const icon = pin.isCharacter ? '⚔' : '📌';
      const detail = pin.isCharacter ? ` (${CHARACTER_CONTEXT_LABELS[pin.detailLevel]})` : '';
      items.push(`${icon} ${pin.entry.name}${detail}`);
    }
    return items.length > 0 ? items.join(', ') : 'Kein Kontext';
  }
);

export function pinEntry(entry: FileEntry, content: string) {
  const isCharacter = entry.type === 'character';
  pinnedEntries.update((pins) => {
    if (pins.find((p) => p.entry.path === entry.path)) return pins;
    // Voreinstellung „Voll" ist bewusst großzügig; klein schaltbar am Pin.
    return [...pins, { entry, content, detailLevel: 'full', isCharacter }];
  });
  // Begleitdateien nachladen und an den Pin hängen (löst über pinnedEntries einen Refresh aus).
  if (isCharacter) {
    void loadCharacterNotes(characterDirOf(entry.path)).then((notes) => {
      pinnedEntries.update((pins) =>
        pins.map((p) => (p.entry.path === entry.path ? { ...p, notes } : p)),
      );
    });
  }
}

export function unpinEntry(path: string) {
  pinnedEntries.update((pins) => pins.filter((p) => p.entry.path !== path));
}

export function setPinDetailLevel(path: string, level: PinDetailLevel) {
  pinnedEntries.update((pins) =>
    pins.map((p) => (p.entry.path === path ? { ...p, detailLevel: level } : p))
  );
}

/**
 * Baut die Charakter-Kontextblöcke neu: der geöffnete Charakter (immer `full`) plus
 * alle Charakter-Pins (mit ihrer jeweiligen Tiefe). Ein Eintrag je Pfad — ist der offene
 * Charakter auch gepinnt, gewinnt der offene. Ein `runToken` verwirft das Ergebnis eines
 * überholten Laufs, sonst gewinnt bei schnellem Datei-Wechsel der langsamere Lauf.
 */
let runToken = 0;
async function refreshCharacterContexts(): Promise<void> {
  const token = ++runToken;
  const af = get(activeFile);
  const fc = get(fileContent);
  const pins = get(pinnedEntries);

  const jobs = new Map<string, { raw: string; level: CharacterContextLevel; notes?: CharacterNotes }>();
  for (const pin of pins) {
    if (pin.isCharacter) jobs.set(pin.entry.path, { raw: pin.content, level: pin.detailLevel, notes: pin.notes });
  }
  if (af?.type === 'character' && fc) {
    const notes = await loadCharacterNotes(characterDirOf(af.path));
    jobs.set(af.path, { raw: fc, level: 'full', notes }); // offener Charakter überschreibt einen Pin
  }

  const built = new Map<string, string>();
  await Promise.all(
    [...jobs].map(async ([path, job]) => {
      const block = await buildCharacterContextFromRaw(job.raw, job.level, job.notes);
      if (block) built.set(path, block);
    }),
  );

  if (token !== runToken) return; // überholt → Ergebnis verwerfen
  characterContextBlocks.set(built);
}

// Neu füllen, sobald der geöffnete Charakter, sein Inhalt oder die Pins sich ändern.
derived([activeFile, fileContent, pinnedEntries], (v) => v).subscribe(() => {
  void refreshCharacterContexts();
});
