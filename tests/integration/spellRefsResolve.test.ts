/**
 * Jeder `spell:`-Verweis des ECHTEN Vaults muss einen Zauber treffen. Ein toter Key fällt sonst
 * nirgends auf — er öffnet nur keinen Tooltip, und das sieht wie ein noch nicht geladener aus.
 * Gesetzt werden die Verweise von `scripts/link-spell-refs.mts`.
 *
 *   npm run test -- spellRefsResolve
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPELL_REF_SCHEME } from '../../src/lib/services/vaultLinks';

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) jsonFiles(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

const spellKeys = new Set(
  jsonFiles('vault/spells')
    .map((f) => (JSON.parse(readFileSync(f, 'utf8')) as { key?: string }).key)
    .filter((k): k is string => !!k),
);

const refs = ['vault/items', 'vault/classes', 'vault/species', 'vault/feats', 'vault/backgrounds']
  .flatMap((root) => jsonFiles(root))
  .flatMap((file) => {
    const matches = readFileSync(file, 'utf8').matchAll(new RegExp(`\\]\\(${SPELL_REF_SCHEME}([^)]+)\\)`, 'g'));
    return [...matches].map((m) => ({ file, key: m[1] }));
  });

describe('Zauberverweise im Vault', () => {
  it('findet Verweise', () => {
    expect(refs.length).toBeGreaterThan(300);
  });

  it('löst jeden Key in der Zauberbibliothek auf', () => {
    expect(refs.filter((r) => !spellKeys.has(r.key))).toEqual([]);
  });
});
