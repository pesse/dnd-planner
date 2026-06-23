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
import type { CharacterCompact, MonsterLibraryEntry } from '../stores/context';
import { runAiAction, type RunOptions } from './aiActions/runner';
import { createEncounterAction } from './aiActions/encounterAction';
import { createMonsterAction } from './aiActions/monsterAction';

export interface DesignEncounterContext {
  config: LlmConfig;
  campaignPath: string;
  actDirName: string;
  /** Inhalt der acts/{akt}/index.md. */
  actContent: string;
  party: CharacterCompact[];
  /** Globale Monster-Bibliothek (für Wiederverwendung bekannter Slugs). */
  library: MonsterLibraryEntry[];
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

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöüß]/g, '');
}

function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await invoke<string>('read_file_content', { path });
    return true;
  } catch {
    return false;
  }
}

const MAX_LIBRARY_LINES = 100;

function buildPreamble(actContent: string, party: CharacterCompact[], library: MonsterLibraryEntry[]): string {
  const blocks: string[] = [];

  blocks.push(`## Akt-Kontext\n${actContent.trim() || '(kein Inhalt)'}`);

  if (party.length) {
    const lines = party.map((c) => {
      const meta = [c.classLevel, c.race].filter(Boolean).join(', ');
      return `- ${c.name}${meta ? ` (${meta})` : ''}`;
    });
    blocks.push(`## Party (${party.length} Charaktere)\n${lines.join('\n')}`);
  } else {
    blocks.push('## Party\n(keine Charakterdaten — wähle plausible party_size/party_level)');
  }

  if (library.length) {
    const lines = library
      .slice(0, MAX_LIBRARY_LINES)
      .map((m) => `- ${m.slug} — ${m.name} (CR ${m.cr})`);
    const more = library.length > MAX_LIBRARY_LINES ? `\n… und ${library.length - MAX_LIBRARY_LINES} weitere` : '';
    blocks.push(`## Vorhandene Monster (Bibliothek — bevorzugt wiederverwenden, slug exakt übernehmen)\n${lines.join('\n')}${more}`);
  }

  return blocks.join('\n\n');
}

function buildMonsterPrompt(slug: string, notes: string, enc: Encounter): string {
  const parts = [
    `Erstelle den Statblock für das Monster „${slug}", das im Encounter „${enc.name}" vorkommt.`,
    notes ? `Rolle/Taktik in diesem Encounter: ${notes}` : '',
    enc.description ? `Encounter-Kontext: ${enc.description}` : '',
    `Zielniveau: Party-Stufe ${enc.party_level}, Encounter-Schwierigkeit „${enc.difficulty}". Wähle einen dazu passenden Herausforderungsgrad (cr) mit konsistenten Werten.`,
  ];
  return parts.filter(Boolean).join('\n');
}

export async function designEncounter(
  ctx: DesignEncounterContext,
  userPrompt: string,
  cb: DesignEncounterCallbacks = {},
): Promise<DesignEncounterResult> {
  const { config, campaignPath, actDirName, actContent, party, library } = ctx;
  const onPhase = cb.onPhase ?? (() => {});
  const runOpts: RunOptions = { onStep: cb.onStep, onActivity: cb.onActivity, signal: cb.signal };
  const throwIfAborted = () => {
    if (cb.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
  };

  // 1) Encounter-JSON generieren
  onPhase('Entwerfe Encounter…');
  const preamble = buildPreamble(actContent, party, library);
  const auftrag = userPrompt.trim() || 'Entwirf einen passenden Kampf-Encounter für diesen Akt.';
  const userInput = `${preamble}\n\n## Auftrag\n${auftrag}`;
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
      content: JSON.stringify(monster, null, 2),
    });
    generatedSlugs.push(slug);
  }

  // 3) Encounter speichern
  throwIfAborted();
  const filename = `${slugify(encounter.name) || 'encounter'}.json`;
  const path = `./vault/campaigns/${campaignPath}/acts/${actDirName}/encounters/${filename}`;
  onPhase('Speichere Encounter…');
  await invoke('write_file_content', { path, content: JSON.stringify(encounter, null, 2) });

  return { encounter, filename, path, reusedSlugs, generatedSlugs };
}
