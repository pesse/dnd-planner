/**
 *   npm run test -- itemNameVariants
 */
import { describe, expect, it } from 'vitest';
import { buildNameIndex } from '../../src/lib/services/library/nameIndex';
import { itemNameVariants } from '../../src/lib/itemLibrary';

describe('Schreibvarianten im Item-Index', () => {
  it('kennt Preissuffix, Komma-Umstellung und Rüstungskurzform', () => {
    expect(itemNameVariants("Weaver's Tools (1 GP)")).toEqual(["Weaver's Tools"]);
    expect(itemNameVariants('Lantern, Bullseye')).toEqual(['Bullseye Lantern']);
    expect(itemNameVariants('Musical Instrument, Lute')).toContain('Lute');
    expect(itemNameVariants('Leather Armor')).toEqual(['Leather']);
  });

  it('ein Alias macht einen echten Namen nie mehrdeutig', () => {
    const items = [
      { path: 'a', key: 'a', name: 'Lute' },
      { path: 'b', key: 'b', name: 'Musical Instrument, Lute' },
    ];
    const index = buildNameIndex(items, {
      key: (i) => i.key, names: (i) => [i.name], identity: (i) => i.path, aliases: (i) => itemNameVariants(i.name),
    });
    expect(index.byName.get('lute')?.key).toBe('a');
    expect(index.ambiguous.has('lute')).toBe(false);
  });
});
