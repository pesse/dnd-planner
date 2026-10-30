/**
 * Gewählte Resistenz eines Gegenstands: die Rüstung der Resistenz wirkt, sobald sie angelegt und eingestimmt ist.
 *
 *   npm run test -- itemDefenses
 */
import { describe, expect, it } from 'vitest';
import type { CharacterInventoryEntry } from '../../src/lib/schemas/characterSchema';
import { buildItemIndex, getAllItemsByDir } from '../../src/lib/itemLibrary';
import { characterDefenses } from '../../src/lib/services/defenses';
import { wornItemsIn } from '../../src/lib/services/wornItems';
import { loadItem } from '../../src/lib/print/character/itemCards';
import { withChosenResistance } from '../../src/lib/utils/chosenResistance';

const ARMOR = 'srd-2024_armor-of-resistance-hide-armor';

async function defensesOf(line: Partial<CharacterInventoryEntry>) {
  const index = buildItemIndex(await getAllItemsByDir());
  const inventory = [{ name: 'Rüstung der Resistenz (Fellrüstung)', sourceKey: ARMOR, count: '1', weight: '6', ...line }];
  return characterDefenses([], 2, wornItemsIn(index, inventory));
}

describe('Resistenz aus der Rüstung der Resistenz', () => {
  it('bietet die zehn Schadensarten der Tabelle zur Wahl', async () => {
    const index = buildItemIndex(await getAllItemsByDir());
    expect(index.byKey.get(ARMOR)?.resistanceChoice?.types).toHaveLength(10);
  });

  it('wirkt erst angelegt und eingestimmt', async () => {
    expect(await defensesOf({ resistance: 'fire' })).toEqual([]);
    expect(await defensesOf({ equipped: true, resistance: 'fire' })).toEqual([]);
  });

  it('zeigt die gewählte Resistenz mit dem Gegenstand als Quelle', async () => {
    const [d] = await defensesOf({ equipped: true, attuned: true, resistance: 'fire' });
    expect(d.textDe).toBe('Resistenz gegen Feuerschaden');
    expect(d.labelDe).toBe('Rüstung der Resistenz (Fellrüstung)');
    expect(d.effect.resistances).toEqual(['fire']);
  });

  it('meldet eine fehlende Wahl, statt still nichts zu gewähren', async () => {
    const [d] = await defensesOf({ equipped: true, attuned: true });
    expect(d.textDe).toBe('Resistenz noch nicht gewählt');
    expect(d.effect.resistances).toEqual([]);
  });

  it('ersetzt nach der Wahl die Würfeltabelle durch die gewählte Resistenz', async () => {
    const index = buildItemIndex(await getAllItemsByDir());
    const item = (await loadItem(index.byKey.get(ARMOR)!.path))!;
    expect(item.desc_de?.join()).toContain('1W10');
    expect(withChosenResistance(item, 'fire').desc_de)
      .toEqual(['Wenn du diese Rüstung trägst, bist du gegen Feuerschaden resistent.']);
    expect(withChosenResistance(item, undefined)).toBe(item);
  });
});
