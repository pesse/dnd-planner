/**
 * Gewählte Resistenz eines Gegenstands: die Rüstung der Resistenz wirkt, sobald sie angelegt ist.
 *
 *   npm run test -- itemDefenses
 */
import { describe, expect, it } from 'vitest';
import type { CharacterInventoryEntry } from '../../src/lib/schemas/characterSchema';
import { buildItemIndex, getAllItemsByDir } from '../../src/lib/itemLibrary';
import { characterDefenses } from '../../src/lib/services/defenses';
import { wornItemsIn } from '../../src/lib/services/wornItems';

const ARMOR = 'srd-2024_armor-of-resistance-hide-armor';

async function defensesOf(line: Partial<CharacterInventoryEntry>) {
  const index = buildItemIndex(await getAllItemsByDir());
  const inventory = [{ name: 'Rüstung der Resistenz (Fellrüstung)', sourceKey: ARMOR, count: '1', weight: '6', ...line }];
  return characterDefenses([], 2, wornItemsIn(index, inventory));
}

describe('Resistenz aus der Rüstung der Resistenz', () => {
  it('bietet die zehn Schadensarten der Tabelle zur Wahl', async () => {
    const index = buildItemIndex(await getAllItemsByDir());
    expect(index.byKey.get(ARMOR)?.resistanceChoice).toHaveLength(10);
  });

  it('wirkt erst angelegt', async () => {
    expect(await defensesOf({ resistance: 'fire' })).toEqual([]);
  });

  it('zeigt die gewählte Resistenz mit dem Gegenstand als Quelle', async () => {
    const [d] = await defensesOf({ equipped: true, resistance: 'fire' });
    expect(d.textDe).toBe('Resistenz gegen Feuerschaden');
    expect(d.labelDe).toBe('Rüstung der Resistenz (Fellrüstung)');
    expect(d.effect.resistances).toEqual(['fire']);
  });

  it('meldet eine fehlende Wahl, statt still nichts zu gewähren', async () => {
    const [d] = await defensesOf({ equipped: true });
    expect(d.textDe).toBe('Resistenz noch nicht gewählt');
    expect(d.effect.resistances).toEqual([]);
  });
});
