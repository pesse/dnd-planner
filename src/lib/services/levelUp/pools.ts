/**
 * Die Options-Pools EINES Aufstiegs. Dieselben Angebote wie am Bogen, nur auf zwei Stufen
 * gelesen: gezeigt wird, was diese Spanne wachsen lässt oder offen gelassen hat.
 */
import { optionPoolOffers, poolPicks, type OptionPoolOffer } from '../declaration/optionPool';
import type { OptionPick } from '../../schemas/characterSchema';

export interface PoolClass {
  sourceKey: string;
  subclassKey: string;
  name: string;
}

/**
 * Nur die AUFSTEIGENDE Klasse: der Pool einer anderen ändert sich in dieser Spanne nicht, und
 * eine dort offene Lücke gehört an den Bogen, nicht in diesen Checkpoint. `fromLevel < 1` ist
 * die neue Klasse — sie hatte vorher gar keinen Pool.
 */
export async function levelUpPools(
  cls: PoolClass,
  picks: readonly OptionPick[],
  fromLevel: number,
  toLevel: number,
): Promise<OptionPoolOffer[]> {
  if (!cls.sourceKey) return [];
  const at = (level: number) => optionPoolOffers({ classes: [{ ...cls, level }] });
  const [before, after] = await Promise.all([fromLevel >= 1 ? at(fromLevel) : [], at(toLevel)]);
  const was = new Map(before.map((o) => [o.featureKey, o.allowance]));
  return after.filter(
    (o) => o.allowance > (was.get(o.featureKey) ?? 0) || poolPicks(picks, o.featureKey).length < o.allowance,
  );
}
