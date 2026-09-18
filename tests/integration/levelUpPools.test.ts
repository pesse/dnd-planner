/**
 * Der Pool-Schnitt des Aufstiegs gegen den echten Vault: der Kampfmeister wächst auf Stufe 7
 * von drei auf fünf Manöver, und genau dann soll der Picker erscheinen.
 *
 *   npm run test -- tests/integration/levelUpPools
 */
import { describe, expect, it } from 'vitest';
import { levelUpPools, type PoolClass } from '../../src/lib/services/levelUp/pools';
import type { OptionPick } from '../../src/lib/schemas/characterSchema';

const BATTLE_MASTER: PoolClass = {
  sourceKey: 'srd-2024_fighter',
  subclassKey: 'phb-2024_battle-master',
  name: 'Kämpfer',
};
const COMBAT_SUPERIORITY = 'phb-2024_fighter_battle-master_combat-superiority';

const filled = (n: number): OptionPick[] =>
  Array.from({ length: n }, (_, i) => ({ sourceKey: COMBAT_SUPERIORITY, value: `M${i}`, valueDe: '' }));

describe('Options-Pools eines Aufstiegs', () => {
  it('zeigt den Pool, wenn sein Kontingent in dieser Spanne wächst', async () => {
    const pools = await levelUpPools(BATTLE_MASTER, filled(3), 6, 7);
    expect(pools.map((p) => [p.featureKey, p.allowance])).toEqual([[COMBAT_SUPERIORITY, 5]]);
  });

  /** Zwischen 4 und 5 ändert sich nichts — ein gefüllter Pool wäre dort nur Rauschen. */
  it('schweigt bei unverändertem und gefülltem Kontingent', async () => {
    expect(await levelUpPools(BATTLE_MASTER, filled(3), 4, 5)).toEqual([]);
  });

  it('zeigt einen offen gebliebenen Pool auch ohne Zuwachs', async () => {
    const pools = await levelUpPools(BATTLE_MASTER, filled(1), 4, 5);
    expect(pools.map((p) => p.featureKey)).toEqual([COMBAT_SUPERIORITY]);
  });

  /** Stufe 3 vergibt das Merkmal erst — davor hat die Klasse keinen Pool. */
  it('kennt auf Stufe 2 keinen Pool und auf Stufe 3 drei Manöver', async () => {
    expect(await levelUpPools(BATTLE_MASTER, [], 1, 2)).toEqual([]);
    const pools = await levelUpPools(BATTLE_MASTER, [], 2, 3);
    expect(pools[0]?.allowance).toBe(3);
    expect(pools[0]?.options.length).toBe(20);
  });

  it('trägt den Regeltext des Merkmals mit, damit er neben dem Picker stehen kann', async () => {
    const [pool] = await levelUpPools(BATTLE_MASTER, [], 2, 3);
    expect(pool.descDe).toContain('Überlegenheitswürfel');
    expect(pool.titleDe).toBe('Kampfüberlegenheit');
  });

  /** Ohne die Subklasse gibt es das Merkmal nicht — der Pool hängt an ihr, nicht am Kämpfer. */
  it('findet ohne Subklasse nichts', async () => {
    expect(await levelUpPools({ ...BATTLE_MASTER, subclassKey: '' }, [], 2, 7)).toEqual([]);
  });
});
