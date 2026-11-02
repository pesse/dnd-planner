/**
 * Monster-Beschreibungen über den ECHTEN Vault: jede Familie verweist nur auf vorhandene Monster.
 *
 *   npm run test -- monsterLore
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { monsterLoreSchema } from '../../src/lib/schemas/monsterLore';
import { getMonsterLore } from '../../src/lib/monsterLoreLibrary';

const LORE = 'vault/monster-lore';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [n]));

const monsterSlugs = new Set(walk('vault/monsters').filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, '')));
const families = readdirSync(LORE).map((n) => monsterLoreSchema.parse(JSON.parse(readFileSync(join(LORE, n), 'utf8'))));

describe('Monster-Beschreibungen', () => {
  it('verweisen nur auf Monster, die es im Vault gibt, und jedes höchstens einmal', () => {
    const slugs = families.flatMap((f) => f.monsters.map((m) => m.slug));
    expect(slugs.filter((s) => !monsterSlugs.has(s))).toEqual([]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('werden über den Slug des Monsters gefunden', async () => {
    const hit = await getMonsterLore('aboleth');
    expect(hit?.family.name).toBe('Aboleth');
    expect(hit?.family.introDe).toBeTruthy();
  });
});
