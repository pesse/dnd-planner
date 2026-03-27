import { derived, writable, type Writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { activeFile, activeCampaign, fileContent } from './campaign';
import type { FileEntry, Monster } from '../types';
import { extractCharacterInfo, formatCharacterForContext } from '../utils/characterExtract';
import { extractActSummary, extractActTitle } from '../utils/actExtract';

export interface EncounterSummaryEntry {
  slug: string;
  actSlug: string;
  name: string;
  difficulty: string;
  xpTotal: number;
  monsterList: string;
  status: 'planned' | 'done' | 'skipped';
}

export type PinDetailLevel = 'rp' | 'full';

export interface MonsterLibraryEntry {
  slug: string;
  name: string;
  cr: string;
  size: string;
  type: string;
}

export interface ContextFlags {
  campaign: boolean;
  acts: boolean;
  encounters: boolean;
  monsters: boolean;
  encounterMonsters: boolean;
  activeFile: boolean;
}

const FLAG_DEFAULTS: ContextFlags = {
  campaign: true,
  acts: true,
  encounters: true,
  monsters: false,
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

export interface PinnedEntry {
  entry: FileEntry;
  content: string;
  detailLevel: PinDetailLevel;
  isCharacter: boolean;
}

export interface ActSummaryEntry {
  name: string;
  title: string;
  summary: string;
  path: string;
}

export const pinnedEntries = writable<PinnedEntry[]>([]);

/** Akt-Summaries der aktiven Kampagne — wird beim Kampagnen-Wechsel geladen. */
export const actSummaries = writable<ActSummaryEntry[]>([]);

/** Inhalt der campaign.md der aktiven Kampagne. */
export const campaignContent = writable<string>('');

export async function loadCampaignContent(campaignPath: string): Promise<void> {
  try {
    const content = await invoke<string>('read_file_content', {
      path: `./vault/campaigns/${campaignPath}/campaign.md`,
    });
    campaignContent.set(content);
  } catch {
    campaignContent.set('');
  }
}

/** Encounter-Summaries der aktiven Kampagne. */
export const encounterSummaries = writable<EncounterSummaryEntry[]>([]);

/** Kondensierte Monster-Bibliothek (Name, CR, Größe, Typ). */
export const monsterLibrary = writable<MonsterLibraryEntry[]>([]);

/** Vollständige Monster-Definitionen für den aktuell geöffneten Encounter. */
export const encounterMonsterDefs = writable<Monster[]>([]);

/** Lädt Encounter-Summaries und Monster-Namen für eine Kampagne. */
export async function loadEncounterContext(campaignPath: string): Promise<void> {
  try {
    const actEntries = await invoke<{ name: string; is_dir: boolean }[]>('list_entries', {
      path: `./vault/campaigns/${campaignPath}/acts`,
    });
    const actDirs = actEntries.filter((e) => e.is_dir).map((e) => e.name);

    const allEncounters: EncounterSummaryEntry[] = [];
    for (const actDirName of actDirs) {
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
              .map((m) => `${m.count}× ${m.slug}`)
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

  try {
    const globalFiles = await invoke<string[]>('list_json_files', { path: './vault/monsters' });
    const library = await Promise.all(
      globalFiles.map(async (filename) => {
        const slug = filename.replace('.json', '');
        try {
          const content = await invoke<string>('read_file_content', { path: `./vault/monsters/${filename}` });
          const m = JSON.parse(content);
          return { slug, name: m.name as string, cr: m.cr as string, size: m.size as string, type: m.type as string };
        } catch {
          return { slug, name: slug, cr: '?', size: '?', type: '?' };
        }
      })
    );
    monsterLibrary.set(library);
  } catch {
    monsterLibrary.set([]);
  }
}

/** Lädt die vollständigen Monster-Definitionen für einen geöffneten Encounter. */
export async function loadEncounterMonsters(encounterContent: string): Promise<void> {
  try {
    const enc = JSON.parse(encounterContent) as { monsters: Array<{ slug: string }> };
    const defs = await Promise.all(
      enc.monsters.map(async (m) => {
        try {
          const content = await invoke<string>('read_file_content', { path: `./vault/monsters/${m.slug}.json` });
          return JSON.parse(content) as Monster;
        } catch {
          return null;
        }
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

function getFileTypeFocus(type: FileEntry['type'] | undefined): string {
  switch (type) {
    case 'campaign':
      return (
        'You are working on the **campaign overview** — the top-level reference document for this campaign. ' +
        'It should contain ONLY what cannot be found elsewhere: Prämisse (1-2 sentences), Hauptkonflikt (overarching arc), ' +
        'Fraktionen (name + goal), Spielercharaktere (name, class, motivation), Ton & Stil (mood/themes), ' +
        'Offene Geheimnisse (campaign-wide unresolved mysteries). ' +
        'Do NOT include: NPC details (use npcs/*.md), session events (use sessions/*.md), ' +
        'act-level content (use acts/*/index.md), or world-building details (use world/*.md). ' +
        'Keep it concise — this document is always included in the LLM context, so every line must earn its place.'
      );
    case 'act':
      return (
        'You are working on an **act**. ' +
        'Structure: ## Summary (2-3 sentences), ## Ergebnis (what players achieved), ' +
        '## Details (challenges, NPC motivations, player choices & consequences). ' +
        'Always maintain this structure when editing.'
      );
    case 'session':
      return (
        'You are working on a **session note**. ' +
        'Structure: ## Summary (what happened), ## Ergebnis (world changes, player achievements), ' +
        '## Details (events, NPC interactions, open threads). ' +
        'Always maintain this structure when editing.'
      );
    case 'npc':
      return (
        'You are working on an **NPC**. ' +
        'Structure: ## Summary (role + one-liner), ## Motivations (what they want), ' +
        '## Details (personality, secrets, connections to plot and other NPCs, reactions to players). ' +
        'Always maintain this structure when editing.'
      );
    case 'world':
      return (
        'You are working on a **world-building entry**. ' +
        'Structure: ## Summary (brief overview), ## Details (history, geography, factions, culture, ' +
        'game-relevant specifics). Always maintain this structure when editing.'
      );
    case 'character':
      return (
        'You are working on a **player character**. ' +
        'Focus: background, personality, connections to the world, open story hooks.'
      );
    default:
      return '';
  }
}

export const systemPrompt = derived(
  [activeFile, activeCampaign, fileContent, pinnedEntries, actSummaries, encounterSummaries, monsterLibrary, encounterMonsterDefs, campaignContent, contextFlags],
  ([$activeFile, $activeCampaign, $fileContent, $pinnedEntries, $actSummaries, $encounterSummaries, $monsterLibrary, $encounterMonsterDefs, $campaignContent, $contextFlags]) => {
    const parts: string[] = [];

    parts.push(
      'You are a helpful assistant for a Dungeon Master. ' +
        'You help create and manage D&D campaigns, scenarios, NPCs, and world-building. ' +
        'Always respond in the same language the user writes in.'
    );

    const focus = getFileTypeFocus($activeFile?.type);
    if (focus) parts.push(`\n## Current Focus\n${focus}`);

    if (true) {
      if ($activeCampaign && $contextFlags.campaign) {
        if ($campaignContent && $activeFile?.type !== 'campaign') {
          parts.push(`\n## Campaign Overview\n\`\`\`markdown\n${$campaignContent}\n\`\`\``);
        } else {
          parts.push(`\n## Active Campaign\nName: ${$activeCampaign.name}`);
        }
      }

      // Other acts: Summary + Ergebnis only. Active act: full content below.
      if ($actSummaries.length > 0 && $contextFlags.acts) {
        const activeActPath = $activeFile?.type === 'act' ? $activeFile.path : null;
        const summaryLines = $actSummaries.map((act) => {
          if (act.path === activeActPath) return null;
          return `### ${act.title}\n${act.summary}`;
        }).filter(Boolean);

        if (summaryLines.length > 0) {
          parts.push(`\n## Act Overviews\n${summaryLines.join('\n\n---\n\n')}`);
        }
      }

      if ($encounterSummaries.length > 0 && $contextFlags.encounters) {
        // Aktuellen Akt aus dem aktiven Dateipfad ableiten
        const actSlugMatch = $activeFile?.path?.match(/\/acts\/([^/]+)\//);
        const currentActSlug = actSlugMatch ? actSlugMatch[1] : null;
        const sortedActNames = [...$actSummaries].sort((a, b) => a.name.localeCompare(b.name)).map((a) => a.name);
        const currentActIndex = currentActSlug ? sortedActNames.indexOf(currentActSlug) : -1;
        const pastActSlugs = new Set(currentActIndex >= 0 ? sortedActNames.slice(0, currentActIndex) : []);

        const pastEnc = $encounterSummaries.filter((e) => pastActSlugs.has(e.actSlug));
        const upcomingEnc = $encounterSummaries.filter((e) => !pastActSlugs.has(e.actSlug));

        if (pastEnc.length > 0) {
          const lines = pastEnc.map((e) => {
            const tag = e.status === 'skipped' ? ' [skipped]' : ' [done]';
            return `- **${e.name}** (${e.actSlug}${tag}, ${e.difficulty}, ${e.xpTotal} XP): ${e.monsterList}`;
          });
          parts.push(`\n## Past Encounters\n${lines.join('\n')}`);
        }

        if (upcomingEnc.length > 0) {
          const lines = upcomingEnc.map((e) => {
            const tag = e.status !== 'planned' ? ` [${e.status}]` : '';
            return `- **${e.name}** (${e.actSlug}${tag}, ${e.difficulty}, ${e.xpTotal} XP): ${e.monsterList}`;
          });
          parts.push(`\n## Planned Encounters\n${lines.join('\n')}`);
        }
      }

      if ($monsterLibrary.length > 0 && $contextFlags.monsters) {
        const lines = $monsterLibrary.map((m) => `- ${m.name} (CR ${m.cr}, ${m.size} ${m.type})`);
        parts.push(`\n## Monster Library\n${lines.join('\n')}`);
      }

      if ($encounterMonsterDefs.length > 0 && $contextFlags.encounterMonsters && $activeFile?.type === 'encounter') {
        const monsterJsons = $encounterMonsterDefs.map((m) => JSON.stringify(m, null, 2)).join(',\n');
        parts.push(`\n## Monsters in This Encounter\n\`\`\`json\n[${monsterJsons}]\n\`\`\``);
      }

      if ($activeFile?.type === 'encounter' || $activeFile?.type === 'monster' || $activeFile?.type === 'act') {
        const showMonster = $activeFile.type === 'monster' || $activeFile.type === 'act';
        const showEncounter = $activeFile.type === 'encounter' || $activeFile.type === 'act';
        const lines: string[] = ['\n## JSON Format for Generation',
          'When creating a monster or encounter, output the JSON in a ```json ... ``` block:'];
        if (showMonster) lines.push(
          '\n**Monster:** `{ name, size, type, alignment, ac: {value, note}, hp: {average, formula}, speed,\n' +
          '  stats: {str,dex,con,int,wis,cha}, saving_throws, skills, damage_resistances, damage_immunities,\n' +
          '  condition_immunities, senses, languages, cr, xp, traits, actions, reactions, legendary_actions, tags }`'
        );
        if (showEncounter) lines.push(
          '\n**Encounter:** `{ name, description, monsters: [{slug, count, notes}],\n' +
          '  difficulty (leicht|mittel|schwer|tödlich), xp_total, party_size, party_level,\n' +
          '  location, loot, tags, notes, status (planned|done|skipped) }`'
        );
        parts.push(lines.join('\n'));
      }

      // Active file (full content)
      if ($activeFile && $fileContent && $contextFlags.activeFile) {
        const label = $activeFile.type === 'act'
          ? `Active Act: ${$activeFile.name}`
          : `Current File: ${$activeFile.name} (${$activeFile.type})`;
        const lang = ($activeFile.type === 'encounter' || $activeFile.type === 'monster') ? 'json' : 'markdown';
        parts.push(`\n## ${label}\n\`\`\`${lang}\n${$fileContent}\n\`\`\``);
      }
    }

    // Gepinnte Einträge
    for (const pin of $pinnedEntries) {
      if (pin.isCharacter && pin.detailLevel === 'rp') {
        const summary = extractCharacterInfo(pin.content, false, false);
        parts.push(`\n${formatCharacterForContext(summary, false, false)}`);
      } else if (pin.isCharacter && pin.detailLevel === 'full') {
        const summary = extractCharacterInfo(pin.content, true, true);
        parts.push(`\n${formatCharacterForContext(summary, true, true)}`);
      } else {
        parts.push(`\n## ${pin.entry.name}\n\`\`\`markdown\n${pin.content}\n\`\`\``);
      }
    }

    return parts.join('\n');
  }
);

export const contextSummary = derived(
  [activeFile, activeCampaign, pinnedEntries, actSummaries, encounterSummaries, monsterLibrary, encounterMonsterDefs, contextFlags],
  ([$activeFile, $activeCampaign, $pinnedEntries, $actSummaries, $encounterSummaries, $monsterLibrary, $encounterMonsterDefs, $contextFlags]) => {
    const items: string[] = [];
    if ($activeCampaign && $contextFlags.campaign) items.push($activeCampaign.name);
    if ($actSummaries.length > 0 && $contextFlags.acts) items.push(`${$actSummaries.length} Akte`);
    if ($encounterSummaries.length > 0 && $contextFlags.encounters) items.push(`${$encounterSummaries.length} Encounters`);
    if ($monsterLibrary.length > 0 && $contextFlags.monsters) items.push(`${$monsterLibrary.length} Monster`);
    if ($encounterMonsterDefs.length > 0 && $contextFlags.encounterMonsters && $activeFile?.type === 'encounter') items.push(`${$encounterMonsterDefs.length} Mon↑`);
    if ($activeFile && $contextFlags.activeFile) items.push($activeFile.name);
    for (const pin of $pinnedEntries) {
      const icon = pin.isCharacter ? '⚔' : '📌';
      const detail = pin.isCharacter ? ` (${pin.detailLevel.toUpperCase()})` : '';
      items.push(`${icon} ${pin.entry.name}${detail}`);
    }
    return items.length > 0 ? items.join(', ') : 'Kein Kontext';
  }
);

export function pinEntry(entry: FileEntry, content: string) {
  pinnedEntries.update((pins) => {
    if (pins.find((p) => p.entry.path === entry.path)) return pins;
    const isCharacter = entry.type === 'character';
    return [...pins, { entry, content, detailLevel: 'rp', isCharacter }];
  });
}

export function unpinEntry(path: string) {
  pinnedEntries.update((pins) => pins.filter((p) => p.entry.path !== path));
}

export function setPinDetailLevel(path: string, level: PinDetailLevel) {
  pinnedEntries.update((pins) =>
    pins.map((p) => (p.entry.path === path ? { ...p, detailLevel: level } : p))
  );
}
