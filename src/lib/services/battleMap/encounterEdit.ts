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

/** Kopie im selben Ordner, damit eigene Monster des Akts weiter greifen. @returns ihr Schlüssel. */
export async function duplicateEncounter(campaignDir: string, key: string): Promise<string> {
  const source = encounterSchema.parse(JSON.parse(await invoke<string>('read_file_content', { path: encounterPath(campaignDir, key) })));
  const actSlug = key.includes('/') ? key.split('/')[0] : '';
  const copy = await createEncounter(campaignDir, actSlug, `${source.name} (Kopie)`);
  await invoke('write_file_content', { path: encounterPath(campaignDir, copy), content: serializeEncounter({ ...source, name: `${source.name} (Kopie)` }) });
  return copy;
}

export const serializeEncounter = (encounter: Encounter): string => JSON.stringify(encounter, null, 2);

/** Ändert die Anzahl im ersten Eintrag des Monsters; bei 0 fliegt er raus, ein neues kommt ans Ende. */
export function withMonsterCount(encounter: Encounter, slug: string, delta: number): Encounter {
  const index = encounter.monsters.findIndex((m) => m.slug === slug);
  if (index >= 0) return withEntryCount(encounter, index, delta);
  return delta > 0 ? { ...encounter, monsters: [...encounter.monsters, { slug, count: delta, notes: '' }] } : encounter;
}

/** Ein Monster darf mehrere Einträge haben (z. B. eine Verstärkungswelle) — geändert wird genau dieser. */
export function withEntryCount(encounter: Encounter, index: number, delta: number): Encounter {
  const monsters = encounter.monsters.flatMap((m, i) => {
    if (i !== index) return [m];
    const count = m.count + delta;
    return count > 0 ? [{ ...m, count }] : [];
  });
  return { ...encounter, monsters };
}

/** Anzahl eines Monsters über alle seine Einträge. */
export const totalCount = (monsters: Encounter['monsters'], slug: string): number =>
  monsters.reduce((sum, m) => sum + (m.slug === slug ? m.count : 0), 0);

/** Akt- oder Kampagnenordner, dessen `monsters/` die Bibliothek für diesen Encounter überschreibt. */
export const scopeDirOf = (encounterPath: string): string => encounterPath.replace(/\/encounters\/[^/]+\.json$/, '');

/** Summe der Monster-EP; Unbekannte zählen nicht. */
export function encounterXp(monsters: Encounter['monsters'], xpOf: (slug: string) => number | undefined): number {
  return monsters.reduce((sum, m) => sum + m.count * (xpOf(m.slug) ?? 0), 0);
}

/** Setzt einen entfernten Eintrag wieder an seine alte Stelle. */
export function withRestored(encounter: Encounter, entry: Encounter['monsters'][number], index: number): Encounter {
  const monsters = [...encounter.monsters];
  monsters.splice(Math.min(index, monsters.length), 0, entry);
  return { ...encounter, monsters };
}

/** Zählt das Monster eines freien Tokens im Encounter mit; die Zuordnung am Token setzt der Aufrufer. */
export async function addMonsterToEncounter(campaignDir: string, key: string, slug: string): Promise<void> {
  const path = encounterPath(campaignDir, key);
  const encounter = encounterSchema.parse(JSON.parse(await invoke<string>('read_file_content', { path })));
  await invoke('write_file_content', { path, content: serializeEncounter(withMonsterCount(encounter, slug, 1)) });
}
