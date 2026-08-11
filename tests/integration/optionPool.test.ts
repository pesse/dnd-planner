/**
 * Die Metamagie-Deklaration gegen den ECHTEN Vault. Der Kern ist die Trennlinie: der Pool
 * liefert ein ANGEBOT für den Editor und stellt KEINE Fragebogen-Frage — stünde er in beiden,
 * wäre die Wahl doppelt.
 *
 *   npm run test -- optionPool
 */
import { describe, expect, it } from 'vitest';
import { collectChoiceSlots } from '../../src/lib/services/characterChoices';
import { optionPoolOffers } from '../../src/lib/services/declaration/optionPool';

const SORCERER_KEY = 'srd-2024_sorcerer';
const METAMAGIC_KEY = 'srd-2024_sorcerer_metamagic';

const sorcerer = (level: number) => ({
  classes: [{ sourceKey: SORCERER_KEY, name: 'Zauberer', level }],
});

const metamagicOffer = async (level: number) =>
  (await optionPoolOffers(sorcerer(level))).find((o) => o.featureKey === METAMAGIC_KEY);

describe('Metamagie als deklarierter Options-Pool', () => {
  it('bietet erst ab Zaubererstufe 2 an und wächst auf 4 und 6', async () => {
    const allowances = await Promise.all(
      [1, 2, 9, 10, 16, 17, 20].map(async (l) => (await metamagicOffer(l))?.allowance ?? 0),
    );
    expect(allowances).toEqual([0, 2, 2, 4, 4, 6, 6]);
  });

  /** Die Optionen stehen wörtlich im `desc`/`descDe` — deutsch als ZITAT, nicht übersetzt. */
  it('stellt die zehn SRD-Optionen mit deutschem Label und Kosten bereit', async () => {
    const offer = await metamagicOffer(2);
    expect(offer?.titleDe).toBe('Metamagie');
    expect(offer?.options.map((o) => o.value)).toEqual([
      'Careful Spell', 'Distant Spell', 'Empowered Spell', 'Extended Spell', 'Heightened Spell',
      'Quickened Spell', 'Seeking Spell', 'Subtle Spell', 'Transmuted Spell', 'Twinned Spell',
    ]);
    expect(offer?.options.every((o) => o.labelDe.trim() && /Zaubereipunkt/.test(o.helpDe))).toBe(true);
  });

  it('stellt keinen Wahl-Platz in der Merkmalsleiste', async () => {
    const { slots } = await collectChoiceSlots(sorcerer(17));
    expect(slots.filter((s) => s.feature.key === METAMAGIC_KEY)).toEqual([]);
  });
});
