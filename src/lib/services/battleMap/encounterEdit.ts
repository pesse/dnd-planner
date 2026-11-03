/** Encounter aus dem Cockpit heraus anlegen und ihre Monsterliste ändern. */
import { invoke } from '@tauri-apps/api/core';
import { encounterSchema, type Encounter } from '../../schemas/encounter';
import { freeName } from '../templates/templates';
import { slugKeepUmlauts } from '../../utils/text';
import { encounterDir, encounterKey, encounterPath } from './tokenDetails';

/** Ein vorhandener Encounter gleichen Namens bleibt stehen; der neue bekommt ein Suffix. @returns sein Schlüssel. */
export async function createEncounter(campaignDir: string, actSlug: string, name: string): Promise<string> {
  const taken = await invoke<string[]>('list_json_files', { path: encounterDir(campaignDir, actSlug) }).catch(() => [] as string[]);
  const slug = freeName(slugKeepUmlauts(name) || 'encounter', new Set(taken.map((f) => f.replace(/\.json$/, ''))));
  const key = encounterKey(actSlug, slug);
  await invoke('write_file_content', { path: encounterPath(campaignDir, key), content: serializeEncounter(encounterSchema.parse({ name })) });
  return key;
}

export const serializeEncounter = (encounter: Encounter): string => JSON.stringify(encounter, null, 2);

/** Ändert die Anzahl eines Monsters; bei 0 fliegt es raus, ein neues kommt ans Ende. */
export function withMonsterCount(encounter: Encounter, slug: string, delta: number): Encounter {
  const current = encounter.monsters.find((m) => m.slug === slug);
  const count = (current?.count ?? 0) + delta;
  const monsters = current
    ? encounter.monsters.flatMap((m) => (m.slug !== slug ? [m] : count > 0 ? [{ ...m, count }] : []))
    : count > 0
      ? [...encounter.monsters, { slug, count, notes: '' }]
      : encounter.monsters;
  return { ...encounter, monsters };
}

/** Akt- oder Kampagnenordner, dessen `monsters/` die Bibliothek für diesen Encounter überschreibt. */
export const scopeDirOf = (encounterPath: string): string => encounterPath.replace(/\/encounters\/[^/]+\.json$/, '');

/** Summe der Monster-EP; Unbekannte zählen nicht. */
export function encounterXp(monsters: Encounter['monsters'], xpOf: (slug: string) => number | undefined): number {
  return monsters.reduce((sum, m) => sum + m.count * (xpOf(m.slug) ?? 0), 0);
}

/** Setzt einen entfernten Eintrag wieder an seine alte Stelle. */
export function withRestored(encounter: Encounter, entry: Encounter['monsters'][number], index: number): Encounter {
  const monsters = encounter.monsters.filter((m) => m.slug !== entry.slug);
  monsters.splice(Math.min(index, monsters.length), 0, entry);
  return { ...encounter, monsters };
}
