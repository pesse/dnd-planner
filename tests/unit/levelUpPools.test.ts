/**
 * Was der Aufstieg aus einem Options-Pool macht: welche Pools er zeigt, und wie der Endstand
 * als EIN Change am Charakter ankommt. Der Tausch am gewachsenen Kontingent ist der Fall,
 * für den die Senke setzend statt additiv ist.
 *
 *   npm run test -- levelUpPools
 */
import { describe, expect, it } from 'vitest';
import { optionPoolChanges } from '../../src/lib/services/levelUp/changes';
import { applyChanges } from '../../src/lib/services/applyChanges';
import type { OptionPoolOffer } from '../../src/lib/services/declaration/optionPool';
import type { Character, OptionPick } from '../../src/lib/schemas/characterSchema';

const MANEUVERS = 'phb-2024_fighter_battle-master_combat-superiority';

const offer = (over: Partial<OptionPoolOffer> = {}): OptionPoolOffer => ({
  featureKey: MANEUVERS, titleDe: 'Kampfüberlegenheit', className: 'Kämpfer',
  allowance: 5, options: [], desc: '', descDe: '', ...over,
});

const pick = (value: string, valueDe = '', sourceKey = MANEUVERS): OptionPick =>
  ({ sourceKey, value, valueDe });

describe('Options-Pool als Änderung', () => {
  it('schreibt den ganzen Stand, nicht die Zugänge', () => {
    const before = [pick('Ambush', 'Hinterhalt')];
    const now = [pick('Ambush', 'Hinterhalt'), pick('Feinting Attack', 'Fintenangriff')];
    const [change] = optionPoolChanges([offer()], now, before);
    expect(change).toMatchObject({
      target: 'optionPicks', sourceKey: MANEUVERS, step: 'declared-choices',
      values: [{ value: 'Ambush' }, { value: 'Feinting Attack' }],
      label: 'Kampfüberlegenheit: Hinterhalt, Fintenangriff',
    });
  });

  it('schweigt, wenn sich nichts geändert hat — auch bei anderer Reihenfolge', () => {
    const before = [pick('Ambush'), pick('Bait and Switch')];
    expect(optionPoolChanges([offer()], [...before].reverse(), before)).toEqual([]);
  });

  /** Ein Pool, den der Checkpoint nicht gezeigt hat, darf hier nicht geschrieben werden. */
  it('fasst nur die angebotenen Pools an', () => {
    const foreign = pick('Careful Spell', '', 'srd-2024_sorcerer_metamagic');
    expect(optionPoolChanges([offer()], [], [foreign])).toEqual([]);
  });
});

describe('Anwendung am Charakter', () => {
  const character = (picks: OptionPick[]) => ({ optionPicks: picks } as Character);

  it('ersetzt die Liste DIESES Merkmals und lässt fremde liegen', () => {
    const foreign = pick('Careful Spell', 'Bedachter Zauber', 'srd-2024_sorcerer_metamagic');
    const c = character([foreign, pick('Ambush', 'Hinterhalt')]);
    applyChanges(c, optionPoolChanges([offer()], [pick('Trip Attack', 'Fallangriff')], c.optionPicks), { classIndex: 0 });
    expect(c.optionPicks).toEqual([foreign, pick('Trip Attack', 'Fallangriff')]);
  });

  /** Der Tausch: abgewählt heißt weg — genau das kann eine additive Senke nicht. */
  it('entfernt eine abgewählte Option', () => {
    const c = character([pick('Ambush'), pick('Trip Attack')]);
    applyChanges(c, optionPoolChanges([offer()], [pick('Trip Attack')], c.optionPicks), { classIndex: 0 });
    expect(c.optionPicks.map((p) => p.value)).toEqual(['Trip Attack']);
  });
});
