/** Lese-Index der Monster-Beschreibungen, nachgeschlagen über den Slug des Monsters. */
import { scanJsonFolder } from './services/library/createLibrary';
import { memoOnce } from './services/library/memo';
import { monsterLoreSchema, type MonsterLore, type MonsterLoreEntry } from './schemas/monsterLore';

export const MONSTER_LORE_PATH = './vault/monster-lore';

export interface MonsterLoreHit {
  family: MonsterLore;
  entry: MonsterLoreEntry;
}

// Ohne installiertes Pack fehlt der Ordner — dann hat eben kein Monster eine Beschreibung.
const bySlug = memoOnce(async () => {
  const families = await scanJsonFolder<MonsterLore | null>(
    MONSTER_LORE_PATH,
    (raw) => monsterLoreSchema.safeParse(raw).data ?? null,
    () => null,
  ).catch(() => []);
  const index = new Map<string, MonsterLoreHit>();
  for (const family of families) {
    for (const entry of family?.monsters ?? []) index.set(entry.slug, { family: family!, entry });
  }
  return index;
});

export async function getMonsterLore(slug: string): Promise<MonsterLoreHit | undefined> {
  return (await bySlug.get()).get(slug);
}

export const invalidateMonsterLore = bySlug.invalidate;

/** Deutsch, wo übersetzt, sonst das englische Original. */
export const loreText = (en: string, de: string | undefined): string => de || en;
