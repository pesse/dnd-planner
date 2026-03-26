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

export const systemPrompt = derived(
  [activeFile, activeCampaign, fileContent, pinnedEntries, actSummaries, contextScope],
  ([$activeFile, $activeCampaign, $fileContent, $pinnedEntries, $actSummaries, $contextScope]) => {
    const parts: string[] = [];

    parts.push(
      'Du bist ein hilfreicher Assistent für einen Dungeon Master. ' +
        'Du hilfst beim Erstellen und Verwalten von D&D-Kampagnen, Szenarien, NPCs und Weltenbau. ' +
        'Antworte auf Deutsch, außer der Nutzer schreibt in einer anderen Sprache.'
    );

    if ($contextScope !== 'none') {
      if ($activeCampaign) {
        parts.push(`\n## Aktive Kampagne\nName: ${$activeCampaign.name}`);
      }

      // Akt-Summaries — aktiver Akt wird als vollständige Datei eingebunden, andere nur als Summary
      if ($actSummaries.length > 0) {
        const activeActPath = $activeFile?.type === 'act' ? $activeFile.path : null;
        const summaryLines = $actSummaries.map((act) => {
          if (act.path === activeActPath) return null; // wird unten als volle Datei eingebunden
          return `### ${act.title}\n${act.summary}`;
        }).filter(Boolean);

        if (summaryLines.length > 0) {
          parts.push(`\n## Akt-Übersichten\n${summaryLines.join('\n\n---\n\n')}`);
        }
      }

      // Aktive Datei (vollständig)
      if ($activeFile && $fileContent) {
        const label = $activeFile.type === 'act'
          ? `Aktiver Akt: ${$activeFile.name}`
          : `Aktuelle Datei: ${$activeFile.name} (${$activeFile.type})`;
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
