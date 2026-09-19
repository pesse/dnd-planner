/**
 * Welche Inventarzeilen eine Volltext-Karte auf den Bogen bringen: das Häkchen `printCard`,
 * aufgelöst über die echte Gegenstandsbibliothek.
 *
 *   npm run test -- itemCardSelection
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { cardItemInfos } from '../../src/lib/print/character/itemCards';

const withInventory = (inventory: Character['inventory']): Character =>
  characterSchema.parse({ name: 'Prüfling Kartendruck', inventory });

const keys = async (inventory: Character['inventory']): Promise<(string | undefined)[]> =>
  (await cardItemInfos(withInventory(inventory))).map((i) => i.key);

describe('Auswahl der Gegenstandskarten', () => {
  it('nimmt nur angehakte Zeilen, in Inventar-Reihenfolge', async () => {
    expect(await keys([
      { name: 'Langschwert', sourceKey: 'srd-2024_longsword', count: '1', weight: '' },
      { name: 'Antitoxin', sourceKey: 'srd-2024_antitoxin', count: '1', weight: '', printCard: true },
      { name: 'Langbogen', sourceKey: 'srd-2024_longbow', count: '1', weight: '', printCard: true },
    ])).toEqual(['srd-2024_antitoxin', 'srd-2024_longbow']);
  });

  it('löst auch eine Zeile ohne Link über den Namen auf — und druckt jede Karte einmal', async () => {
    expect(await keys([
      { name: 'Langschwert', count: '1', weight: '', printCard: true },
      { name: 'Langschwert', sourceKey: 'srd-2024_longsword', count: '1', weight: '', printCard: true },
    ])).toEqual(['srd-2024_longsword']);
  });

  it('lässt einen Namen liegen, den die Bibliothek nicht führt', async () => {
    expect(await keys([
      { name: 'Opas Glücksmünze', count: '1', weight: '', printCard: true },
    ])).toEqual([]);
  });
});
