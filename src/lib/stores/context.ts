import { derived, writable, type Writable } from 'svelte/store';
import { activeFile, activeCampaign, fileContent } from './campaign';
import type { FileEntry, Monster } from '../types';
import {
  buildCharacterContextFromRaw,
  loadCharacterNotes,
  characterDirOf,
  CHARACTER_CONTEXT_LABELS,
  type CharacterContextLevel,
  type CharacterNotes,
} from '../services/characterContext';
import { buildSystemPrompt } from '../services/contextPrompt';
import {
  fetchActSummaries,
  fetchCampaignContent,
  fetchCampaignParty,
  fetchEncounterMonsters,
  fetchEncounterSummaries,
  fetchMonsterLibrary,
  invalidateMonsterPaths,
} from '../services/contextLoad';
import type {
  ActSummaryEntry,
  CharacterCompact,
  ContextFlags,
  EncounterSummaryEntry,
  MonsterLibraryEntry,
  PinDetailLevel,
  PinnedEntry,
} from '../services/contextTypes';

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

/** Encounter-Summaries der aktiven Kampagne. */
export const encounterSummaries = writable<EncounterSummaryEntry[]>([]);

/** Kondensierte Monster-Bibliothek (Name, CR, Größe, Typ). */
export const monsterLibrary = writable<MonsterLibraryEntry[]>([]);

/** Vollständige Monster-Definitionen für den aktuell geöffneten Encounter. */
export const encounterMonsterDefs = writable<Monster[]>([]);

export async function loadCampaignContent(campaignPath: string): Promise<void> {
  try {
    const content = await fetchCampaignContent(campaignPath);
    campaignContent.set(content);
    campaignCharacterData.set(await fetchCampaignParty(content));
  } catch {
    campaignContent.set('');
    campaignCharacterData.set([]);
  }
}

/** Neu-laden der Charakterdaten aus einem gegebenen campaign.md-Inhalt (z.B. nach Frontmatter-Edit). */
export async function reloadCampaignCharacters(campaignMd: string): Promise<void> {
  campaignContent.set(campaignMd);
  campaignCharacterData.set(await fetchCampaignParty(campaignMd));
}

/** Lädt Encounter-Summaries und Monster-Namen für eine Kampagne. */
export async function loadEncounterContext(campaignPath: string): Promise<void> {
  invalidateMonsterPaths(); // Slug→Pfad-Cache neu aufbauen (Vault kann sich geändert haben)
  // Monster-Bibliothek zuerst, damit die Encounter-Listen Name+CR anreichern können
  const library = await fetchMonsterLibrary();
  monsterLibrary.set(library);
  encounterSummaries.set(await fetchEncounterSummaries(campaignPath, library));
}

export async function loadEncounterMonsters(encounterContent: string, encounterPath?: string): Promise<void> {
  encounterMonsterDefs.set(await fetchEncounterMonsters(encounterContent, encounterPath));
}

/** Lädt alle Akt-Summaries für eine Kampagne. Aufruf beim Kampagnen-Wechsel. */
export async function loadActSummaries(campaignPath: string): Promise<void> {
  actSummaries.set(await fetchActSummaries(campaignPath));
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
async function refreshCharacterContexts(
  af: FileEntry | null,
  fc: string,
  pins: PinnedEntry[],
): Promise<void> {
  const token = ++runToken;

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
derived([activeFile, fileContent, pinnedEntries], (v) => v).subscribe(([af, fc, pins]) => {
  void refreshCharacterContexts(af, fc, pins);
});
