/**
 * Gegenstände am Vorrat: ein `grantsResource` wirkt erst angelegt — und eingestimmt, wo der
 * Gegenstand Einstimmung verlangt.
 *
 *   npm run test -- resourceItems
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { resolveResources } from '../../src/lib/services/resources/resolve';

const CLOAK = 'Umhang der Wut';

const barbarian = (inventory: Character['inventory']): Character =>
  characterSchema.parse({
    name: 'Grum Steinfaust',
    classes: [{ sourceKey: 'srd-2024_barbarian', name: 'Barbar', level: 3 }],
    inventory,
  });

const rageMax = async (c: Character): Promise<number> => {
  const { pools } = await resolveResources(c);
  return pools.find((p) => p.featureKey === 'srd-2024_barbarian_rage')?.max[0] ?? 0;
};

describe('Vorräte aus dem Inventar', () => {
  it('zählt den Kampfrausch aus der Stufentabelle, solange nichts wirkt', async () => {
    expect(await rageMax(barbarian([]))).toBe(3);
    expect(await rageMax(barbarian([{ name: CLOAK, count: '1', weight: '' }]))).toBe(3);
  });

  it('addiert erst, wenn angelegt UND eingestimmt', async () => {
    expect(await rageMax(barbarian([{ name: CLOAK, count: '1', weight: '', equipped: true }]))).toBe(3);
    expect(await rageMax(barbarian([{ name: CLOAK, count: '1', weight: '', equipped: true, attuned: true }]))).toBe(5);
  });

  it('nennt den Gegenstand als Herkunft des Zuschlags', async () => {
    const { pools } = await resolveResources(
      barbarian([{ name: CLOAK, count: '1', weight: '', equipped: true, attuned: true }]),
    );
    const rage = pools.find((p) => p.featureKey === 'srd-2024_barbarian_rage');

    expect(rage?.additions).toEqual([{ labelDe: CLOAK, amount: 2 }]);
  });
});
