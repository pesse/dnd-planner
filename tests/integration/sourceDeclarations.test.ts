import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isImportSource, SOURCE_KEYS } from '$lib/schemas/source';
import { sourceDeclarationSchema } from '$lib/schemas/sourceDeclaration';

const VAULT = 'vault';
const ROOTS = ['spells', 'classes', 'species', 'feats', 'backgrounds', 'items', 'monsters', 'monster-lore', 'rules'];

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
    : [];

const declarationFiles = walk(join(VAULT, 'sources')).filter((p) => p.endsWith('.json'));
const keysIn = (root: string): Map<string, string> =>
  new Map(walk(join(VAULT, root)).filter((p) => p.endsWith('.json')).map((p) => {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { key?: string; source?: string };
    return [raw.key ?? '', raw.source ?? ''];
  }));

const declarations = declarationFiles.map((p) => ({ path: p, ...sourceDeclarationSchema.parse(JSON.parse(readFileSync(p, 'utf8'))) }));

describe('Herkunfts-Deklarationen', () => {
  it('heißen wie ihre Herkunft und führen jedes D&D-Beyond-Buch nur einmal', () => {
    expect(declarations.filter((d) => !d.path.endsWith(`/${d.source}.json`)).map((d) => d.path)).toEqual([]);
    const ids = declarations.flatMap((d) => d.ddbSourceIds);
    expect(ids.length).toBe(new Set(ids).size);
  });

  // Das Herkunftsfeld nimmt jedes Kürzel an; dass es keinen Tippfehler gibt, sichert erst dieser Test.
  it('jede Herkunft im Vault ist fest, importiert oder deklariert', () => {
    const known = new Set<string>([...SOURCE_KEYS, ...declarations.map((d) => d.source)]);
    const unknown = ROOTS.flatMap((root) => walk(join(VAULT, root)))
      .filter((p) => p.endsWith('.json'))
      .flatMap((p) => {
        const source = (JSON.parse(readFileSync(p, 'utf8')) as { source?: unknown }).source;
        return typeof source === 'string' && !known.has(source) && !isImportSource(source) ? [`${p}: ${source}`] : [];
      });
    expect(unknown).toEqual([]);
  });

  it('verweisen nur auf vorhandene Einträge fremder Herkunft', () => {
    const roots = { monsters: keysIn('monsters'), items: keysIn('items') };
    const broken = declarations.flatMap((d) =>
      (['monsters', 'items'] as const).flatMap((root) =>
        d.includes[root].filter((key) => !roots[root].has(key) || roots[root].get(key) === d.source)
          .map((key) => `${d.source}: ${root}/${key}`)));
    expect(broken).toEqual([]);
  });
});
