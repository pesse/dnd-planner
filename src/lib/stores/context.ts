import { derived, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { activeFile, activeCampaign, fileContent } from './campaign';
import type { FileEntry } from '../types';
import { extractCharacterInfo, formatCharacterForContext } from '../utils/characterExtract';
import { extractActSummary, extractActTitle } from '../utils/actExtract';

export type ContextScope = 'none' | 'file';
export type PinDetailLevel = 'rp' | 'full';

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

export const contextScope = writable<ContextScope>('file');
export const pinnedEntries = writable<PinnedEntry[]>([]);

/** Akt-Summaries der aktiven Kampagne — wird beim Kampagnen-Wechsel geladen. */
export const actSummaries = writable<ActSummaryEntry[]>([]);

/** Lädt alle Akt-Summaries für eine Kampagne. Aufruf beim Kampagnen-Wechsel. */
export async function loadActSummaries(campaignPath: string): Promise<void> {
  try {
    const files = await invoke<string[]>('list_directory', {
      path: `./vault/campaigns/${campaignPath}/acts`,
    });
    const entries = await Promise.all(
      files.map(async (filename) => {
        const path = `./vault/campaigns/${campaignPath}/acts/${filename}`;
        const content = await invoke<string>('read_file_content', { path });
        return {
          name: filename.replace('.md', ''),
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
        'You are working on the **campaign overview**. ' +
        'Focus: overarching themes, main plot arc, factions, key NPCs. ' +
        'Keep it as a living overview document — concise, no session-level details.'
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
  [activeFile, activeCampaign, fileContent, pinnedEntries, actSummaries, contextScope],
  ([$activeFile, $activeCampaign, $fileContent, $pinnedEntries, $actSummaries, $contextScope]) => {
    const parts: string[] = [];

    parts.push(
      'You are a helpful assistant for a Dungeon Master. ' +
        'You help create and manage D&D campaigns, scenarios, NPCs, and world-building. ' +
        'Always respond in the same language the user writes in.'
    );

    const focus = getFileTypeFocus($activeFile?.type);
    if (focus) parts.push(`\n## Current Focus\n${focus}`);

    if ($contextScope !== 'none') {
      if ($activeCampaign) {
        parts.push(`\n## Active Campaign\nName: ${$activeCampaign.name}`);
      }

      // Other acts: Summary + Ergebnis only. Active act: full content below.
      if ($actSummaries.length > 0) {
        const activeActPath = $activeFile?.type === 'act' ? $activeFile.path : null;
        const summaryLines = $actSummaries.map((act) => {
          if (act.path === activeActPath) return null;
          return `### ${act.title}\n${act.summary}`;
        }).filter(Boolean);

        if (summaryLines.length > 0) {
          parts.push(`\n## Act Overviews\n${summaryLines.join('\n\n---\n\n')}`);
        }
      }

      // Active file (full content)
      if ($activeFile && $fileContent) {
        const label = $activeFile.type === 'act'
          ? `Active Act: ${$activeFile.name}`
          : `Current File: ${$activeFile.name} (${$activeFile.type})`;
        parts.push(`\n## ${label}\n\`\`\`markdown\n${$fileContent}\n\`\`\``);
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
  [activeFile, activeCampaign, pinnedEntries, actSummaries, contextScope],
  ([$activeFile, $activeCampaign, $pinnedEntries, $actSummaries, $contextScope]) => {
    const items: string[] = [];
    if ($contextScope !== 'none') {
      if ($activeCampaign) items.push($activeCampaign.name);
      if ($actSummaries.length > 0) items.push(`${$actSummaries.length} Akte`);
      if ($activeFile) items.push($activeFile.name);
    }
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
