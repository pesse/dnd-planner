/**
 * Encounter als Druckseite: Statblöcke nachladen, HTML bauen, drucken.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Encounter, Monster } from '../types';
import { normalizeMonster } from '../utils/schemaValidation';
import { buildPrintHtml, type PrintMonster } from '../utils/printEncounter';
import { printHtmlDocument } from '../utils/printFrame';
import { globalMonsterCandidates } from '../monsterLibrary';

async function readMonster(path: string): Promise<Monster | null> {
  try {
    return normalizeMonster(JSON.parse(await invoke<string>('read_file_content', { path })) as Monster);
  } catch {
    return null;
  }
}

async function readGlobalMonster(slug: string): Promise<Monster | null> {
  for (const path of await globalMonsterCandidates(slug)) {
    const monster = await readMonster(path);
    if (monster) return monster;
  }
  return null;
}

/** Akt-lokal schlägt global; ein fehlender Statblock bleibt als Lücke stehen (`monster: null`). */
export async function loadPrintMonsters(encounter: Encounter, actMonsterBasePath?: string): Promise<PrintMonster[]> {
  return Promise.all(
    encounter.monsters.filter((m) => m.slug).map(async (m) => {
      const local = actMonsterBasePath ? await readMonster(`${actMonsterBasePath}/${m.slug}.json`) : null;
      const monster = local ?? (await readGlobalMonster(m.slug));
      return { monster, count: m.count, notes: m.notes, slug: m.slug };
    }),
  );
}

export async function printEncounter(
  encounter: Encounter,
  actMonsterBasePath: string | undefined,
  campaignName: string | undefined,
): Promise<void> {
  const monsters = await loadPrintMonsters(encounter, actMonsterBasePath);
  const prefix = campaignName ? `${campaignName} – ` : '';
  printHtmlDocument(buildPrintHtml(encounter, monsters), `${prefix}Encounter: ${encounter.name}`);
}
