/**
 * Erzeugt das Encounter-JSON per KI und stellt sicher, dass alle referenzierten Monster
 * existieren. Reine Service-Logik ohne Store-/UI-Kopplung — das App-Wiring lebt in
 * `services/contextActions.ts`.
 */
import { invoke } from '@tauri-apps/api/core';
import type { LlmConfig, Monster, Encounter } from '../types';
import type { MonsterLibraryEntry } from './contextTypes';
import { formatMinimumLine, type CharacterMinimum } from './characterContext';
import { runAiAction, type RunOptions } from './aiActions/runner';
import { createEncounterAction } from './aiActions/encounterAction';
import { createMonsterAction } from './aiActions/monsterAction';
import { crLabel } from './monsterFormat';
import { toActLocalJson } from '../utils/vaultJson';
import { slugKeepUmlauts, slugToName } from '../utils/text';

export interface DesignEncounterContext {
  config: LlmConfig;
  campaignPath: string;
  actDirName: string;
  /** Inhalt der acts/{akt}/index.md. */
  actContent: string;
  party: CharacterMinimum[];
  /** Globale Monster-Bibliothek (für Wiederverwendung bekannter Slugs). */
  library: MonsterLibraryEntry[];
  /** Wie viel Bibliothek in den Prompt einfließt — Tokens sparen. */
  libraryOptions?: LibraryOptions;
}

export interface LibraryOptions {
  include?: boolean;
  /** Leer/undefined → alle Gruppen. */
  groups?: string[];
  maxEntries?: number;
}

export interface DesignEncounterCallbacks extends RunOptions {
  onPhase?: (text: string) => void;
}

export interface DesignEncounterResult {
  encounter: Encounter;
  filename: string;
  path: string;
  reusedSlugs: string[];
  generatedSlugs: string[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await invoke<string>('read_file_content', { path });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_MAX_LIBRARY_ENTRIES = 30;

/**
 * `groups` undefined → alle; gesetzt (auch leer) → nur diese. Eine leere Liste heißt also
 * KEINE Bibliothek, konsistent mit der Gruppen-Kuratierung im Chat-Kontext.
 */
function selectLibrary(library: MonsterLibraryEntry[], opts?: LibraryOptions): MonsterLibraryEntry[] {
  if (opts?.include === false) return [];
  const groups = opts?.groups;
  const filtered = groups ? library.filter((m) => groups.includes(m.group)) : library;
  return filtered.slice(0, opts?.maxEntries ?? DEFAULT_MAX_LIBRARY_ENTRIES);
}

function buildPreamble(
  actContent: string,
  party: CharacterMinimum[],
  library: MonsterLibraryEntry[],
  libraryOptions?: LibraryOptions,
): string {
  const blocks: string[] = [];

  blocks.push(`## Act context\n${actContent.trim() || '(no content)'}`);

  if (party.length) {
    blocks.push(`## Party (${party.length} characters)\n${party.map(formatMinimumLine).join('\n')}`);
  } else {
    blocks.push('## Party\n(no character data — choose a plausible party_size/party_level)');
  }

  const selected = selectLibrary(library, libraryOptions);
  if (selected.length) {
    const lines = selected.map((m) => `- ${m.slug} — ${m.name} (CR ${crLabel(m.challenge_rating)})`);
    blocks.push(`## Available monsters (library — prefer reusing these; copy the slug exactly)\n${lines.join('\n')}`);
  }

  return blocks.join('\n\n');
}

function buildMonsterPrompt(slug: string, notes: string, enc: Encounter): string {
  const parts = [
    `Create the statblock for the monster "${slug}", which appears in the encounter "${enc.name}".`,
    notes ? `Role/tactics in this encounter: ${notes}` : '',
    enc.description ? `Encounter context: ${enc.description}` : '',
    `Target level: party level ${enc.party_level}, encounter difficulty "${enc.difficulty}". Choose a fitting challenge_rating with consistent values.`,
  ];
  return parts.filter(Boolean).join('\n');
}

/**
 * Akt-lokal oder in der globalen Bibliothek vorhandene Monster werden wiederverwendet, alles
 * Übrige generiert und unter `acts/{akt}/monsters/` abgelegt.
 */
async function resolveMonsters(input: {
  encounter: Encounter;
  actMonsterDir: string;
  library: MonsterLibraryEntry[];
  config: LlmConfig;
  runOpts: RunOptions;
  onPhase: (text: string) => void;
  throwIfAborted: () => void;
}): Promise<{ reusedSlugs: string[]; generatedSlugs: string[] }> {
  const { encounter, actMonsterDir, config, runOpts, onPhase, throwIfAborted } = input;
  const librarySlugs = new Set(input.library.map((m) => m.slug));
  const uniqueSlugs = [...new Set(encounter.monsters.map((m) => m.slug).filter(Boolean))];
  const reusedSlugs: string[] = [];
  const generatedSlugs: string[] = [];

  for (const slug of uniqueSlugs) {
    throwIfAborted();
    if (await fileExists(`${actMonsterDir}/${slug}.json`)) {
      reusedSlugs.push(slug);
      continue;
    }
    if (librarySlugs.has(slug)) {
      reusedSlugs.push(slug);
      continue;
    }
    const ref = encounter.monsters.find((m) => m.slug === slug);
    onPhase(`Generiere fehlendes Monster „${slug}"…`);
    const monster = await runAiAction<Monster>(
      config,
      createMonsterAction({ name: slugToName(slug) }),
      buildMonsterPrompt(slug, ref?.notes ?? '', encounter),
      runOpts,
    );
    await invoke('write_file_content', {
      path: `${actMonsterDir}/${slug}.json`,
      content: toActLocalJson(monster),
    });
    generatedSlugs.push(slug);
  }
  return { reusedSlugs, generatedSlugs };
}

export async function designEncounter(
  ctx: DesignEncounterContext,
  userPrompt: string,
  cb: DesignEncounterCallbacks = {},
): Promise<DesignEncounterResult> {
  const { config, campaignPath, actDirName, actContent, party, library, libraryOptions } = ctx;
  const onPhase = cb.onPhase ?? (() => {});
  const runOpts: RunOptions = { onStep: cb.onStep, onActivity: cb.onActivity, signal: cb.signal };
  const throwIfAborted = () => {
    if (cb.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
  };

  onPhase('Entwerfe Encounter…');
  const preamble = buildPreamble(actContent, party, library, libraryOptions);
  const auftrag = userPrompt.trim() || 'Design a fitting combat encounter for this act.';
  const userInput = `${preamble}\n\n## Task\n${auftrag}`;
  const encounter = await runAiAction<Encounter>(config, createEncounterAction(), userInput, runOpts);

  const actMonsterDir = `./vault/campaigns/${campaignPath}/acts/${actDirName}/monsters`;
  const { reusedSlugs, generatedSlugs } = await resolveMonsters({
    encounter, actMonsterDir, library, config, runOpts, onPhase, throwIfAborted,
  });

  throwIfAborted();
  const filename = `${slugKeepUmlauts(encounter.name) || 'encounter'}.json`;
  const path = `./vault/campaigns/${campaignPath}/acts/${actDirName}/encounters/${filename}`;
  onPhase('Speichere Encounter…');
  await invoke('write_file_content', { path, content: JSON.stringify(encounter, null, 2) });

  return { encounter, filename, path, reusedSlugs, generatedSlugs };
}
