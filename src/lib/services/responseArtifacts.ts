/**
 * Was in einer LLM-Antwort steckt: Code-Blöcke, Markdown, speicherbares JSON —
 * und das Schreiben dieser Fundstücke in den Vault.
 */
import { invoke } from '@tauri-apps/api/core';
import { replaceContent } from '../stores/campaign';
import { invalidateLibraryCaches } from './library/invalidate';
import { loadEncounterContext } from '../stores/context';
import { stripJsonFence } from './jsonFence';
import { slugKeepUmlauts } from '../utils/text';
import type { Campaign, FileEntry } from '../types';

const JSON_FILE_TYPES = new Set(['monster', 'encounter', 'npc']);

export interface DetectedJson {
  type: 'monster' | 'encounter';
  data: Record<string, unknown>;
  raw: string;
}

export interface Segment {
  type: 'text' | 'code';
  content: string;
  lang?: string;
}

export function extractJsonBlocks(text: string): DetectedJson[] {
  const results: DetectedJson[] = [];
  const regex = /```json\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1]) as Record<string, unknown>;
      if ('challenge_rating' in data && 'ability_scores' in data) {
        results.push({ type: 'monster', data, raw: match[1] });
      } else if ('monsters' in data && 'difficulty' in data) {
        results.push({ type: 'encounter', data, raw: match[1] });
      }
    } catch { /* ignorieren */ }
  }
  return results;
}

export function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s/m.test(text) ||
    /\*\*.+?\*\*/s.test(text) ||
    /```[\s\S]*?```/.test(text) ||
    /^[-*]\s/m.test(text) ||
    /^\d+\.\s/m.test(text) ||
    /^>\s/m.test(text);
}

export function hasCodeBlock(text: string): boolean {
  return /```[\w]*\n[\s\S]*?```/.test(text);
}

export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /```([\w]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', lang: match[1] ?? '', content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}

const DEFAULT_NAMES: Record<string, string> = {
  session:   'neue-session.md',
  npc:       'neuer-npc.md',
  world:     'neuer-ort.md',
  encounter: 'neuer-encounter.json',
  monster:   'neues-monster.json',
  character: 'neuer-charakter.md',
  act:       'neuer-akt/index.md',
  campaign:  'neue-kampagne.md',
};

export function suggestNewFilePath(file: FileEntry | null, campaign: Campaign | null): string {
  if (file) {
    const lastSlash = file.path.lastIndexOf('/');
    const dir = lastSlash >= 0 ? file.path.slice(0, lastSlash + 1) : './vault/';
    return `${dir}${DEFAULT_NAMES[file.type] ?? 'neue-datei.md'}`;
  }
  if (campaign) return `./vault/campaigns/${campaign.path}/sessions/neue-session.md`;
  return './vault/neue-datei.md';
}

/** Ersetzt den Inhalt der aktiven Datei; bei JSON-Dateien ohne den Markdown-Fence der Antwort. */
export function replaceWithResponse(content: string, file: FileEntry | null): void {
  replaceContent(file && JSON_FILE_TYPES.has(file.type) ? stripJsonFence(content) : content);
}

export async function writeNewFile(path: string, content: string): Promise<void> {
  await invoke('write_file_content', { path, content });
  // Der Pfad kommt aus der Antwort — welche Bibliothek getroffen ist, steht hier nicht fest.
  invalidateLibraryCaches();
}

export async function saveJsonBlock(block: DetectedJson, campaign: Campaign): Promise<void> {
  const name = (block.data.name as string) || 'unbekannt';
  const slug = slugKeepUmlauts(name);
  const path =
    block.type === 'monster'
      ? `./vault/monsters/${slug}.json`
      : `./vault/campaigns/${campaign.path}/encounters/${slug}.json`;
  await writeNewFile(path, JSON.stringify(block.data, null, 2));
  if (block.type === 'encounter') loadEncounterContext(campaign.path);
}
