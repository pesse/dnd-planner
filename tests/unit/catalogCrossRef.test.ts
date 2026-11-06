import { describe, expect, it } from 'vitest';
import { crossRefNote, facetOptions, type CatalogRow } from '$lib/services/catalog/catalogTypes';

const row = (source: CatalogRow['facets']['source']): CatalogRow =>
  ({ path: 'p', entryName: 'e', name: 'Goblinkrieger', group: 'fey', icon: null, iconColor: '', cells: {}, facets: { source } });

const goblin = row([
  { id: 'srd-2024', label: 'SRD 5.2' },
  { id: 'hellfire-club', label: 'Hellfire Club', via: 'SRD 5.2' },
]);

describe('Quellfilter mit Verweisen', () => {
  it('nennt die eigene Herkunft nur, wenn die Zeile allein über den Verweis passt', () => {
    expect(crossRefNote(goblin, { source: ['hellfire-club'] })).toBe('SRD 5.2');
    expect(crossRefNote(goblin, { source: ['hellfire-club', 'srd-2024'] })).toBeUndefined();
    expect(crossRefNote(goblin, {})).toBeUndefined();
  });

  it('bietet den Verweis als gewöhnlichen Filterwert an', () => {
    expect(facetOptions([goblin], 'source').map((v) => v.via)).toEqual([undefined, undefined]);
  });
});
