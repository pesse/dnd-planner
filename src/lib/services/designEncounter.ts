/**
 * Orchestriert „Encounter inkl. Monster entwerfen": erzeugt das Encounter-JSON per
 * KI und stellt sicher, dass alle referenzierten Monster existieren.
 *
 * Monster-Auflösung (erfüllt „Bibliothek/SRD bevorzugen, Rest generieren"):
 *   - akt-lokal vorhanden  → wiederverwenden
 *   - in globaler Bibliothek → wiederverwenden (löst dank Typ-Ordner-Suche korrekt auf)
 *   - sonst                → per createMonsterAction generieren (zieht selbst SRD vor)
 *                            und akt-lokal unter acts/{akt}/monsters/ ablegen.
 *
 * Reine Service-Logik ohne Store-/UI-Kopplung — das App-Wiring (Datei öffnen,
 * Kontext neu laden) lebt in services/contextActions.ts.
 */
import { invoke } from '@tauri-apps/api/core';
import type { LlmConfig, Monster, Encounter } from '../types';
import type { MonsterLibraryEntry } from './contextTypes';
import { formatMinimumLine, type CharacterMinimum } from './characterContext';
import { runAiAction, type RunOptions } from './aiActions/runner';
import { createEncounterAction } from './aiActions/encounterAction';
import { createMonsterAction } from './aiActions/monsterAction';
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
  /** Steuert, wie viel der Monster-Bibliothek in den Entwurfs-Prompt einfließt
   *  (Tokens sparen). Default: nur kuratierte Gruppen, gekappt auf maxEntries. */
  libraryOptions?: LibraryOptions;
}

export interface LibraryOptions {
  /** Bibliotheks-Block ganz weglassen. Default: true (einbeziehen). */
  include?: boolean;
  /** Nur diese Monster-Gruppen (= types) einbeziehen. Leer/undefined → alle. */
  groups?: string[];
  /** Obergrenze für die Anzahl gelisteter Monster. Default: 30. */
  maxEntries?: number;
}

export interface DesignEncounterCallbacks extends RunOptions {
  /** Grobe Phasen-Meldung für die UI (z.B. „Generiere Monster „x"…"). */
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

/** Wählt die für den Entwurf einzubeziehenden Bibliotheks-Einträge gemäß Optionen.
 *  `groups` undefined → alle Gruppen; gesetzt (auch leer) → nur diese (leer ⇒ keine,
 *  konsistent mit der Monster-Gruppen-Kuratierung im Chat-Kontext, context.ts:499). */
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
    const lines = selected.map((m) => `- ${m.slug} — ${m.name} (CR ${m.cr})`);
    blocks.push(`## Available monsters (library — prefer reusing these; copy the slug exactly)\n${lines.join('\n')}`);
  }

  return blocks.join('\n\n');
}

function buildMonsterPrompt(slug: string, notes: string, enc: Encounter): string {
  const parts = [
    `Create the statblock for the monster "${slug}", which appears in the encounter "${enc.name}".`,
    notes ? `Role/tactics in this encounter: ${notes}` : '',
    enc.description ? `Encounter context: ${enc.description}` : '',
    `Target level: party level ${enc.party_level}, encounter difficulty "${enc.difficulty}". Choose a fitting challenge rating (cr) with consistent values.`,
  ];
  return parts.filter(Boolean).join('\n');
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

  // 1) Encounter-JSON generieren (tool-frei → ein Call)
  onPhase('Entwerfe Encounter…');
  const preamble = buildPreamble(actContent, party, library, libraryOptions);
  const auftrag = userPrompt.trim() || 'Design a fitting combat encounter for this act.';
  const userInput = `${preamble}\n\n## Task\n${auftrag}`;
  const encounter = await runAiAction<Encounter>(config, createEncounterAction(), userInput, runOpts);

  // 2) Referenzierte Monster auflösen (vorhandene wiederverwenden, fehlende generieren)
  const actMonsterDir = `./vault/campaigns/${campaignPath}/acts/${actDirName}/monsters`;
  const librarySlugs = new Set(library.map((m) => m.slug));
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

  // 3) Encounter speichern
  throwIfAborted();
  const filename = `${slugKeepUmlauts(encounter.name) || 'encounter'}.json`;
  const path = `./vault/campaigns/${campaignPath}/acts/${actDirName}/encounters/${filename}`;
  onPhase('Speichere Encounter…');
  await invoke('write_file_content', { path, content: JSON.stringify(encounter, null, 2) });

  return { encounter, filename, path, reusedSlugs, generatedSlugs };
}
