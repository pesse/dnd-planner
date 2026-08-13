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
const WARLOCK_KEY = 'srd-2024_warlock';
const INVOCATIONS_KEY = 'srd-2024_warlock_eldritch-invocations';

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

describe('Schauerliche Anrufungen als deklarierter Options-Pool', () => {
  const invocationOffer = async (level: number) =>
    (await optionPoolOffers({ classes: [{ sourceKey: WARLOCK_KEY, name: 'Hexenmeister', level }] })).find(
      (o) => o.featureKey === INVOCATIONS_KEY,
    );

  /** Alle Anrufungen kommen von Stufe 1; die Zahl führt die Spalte „Eldritch Invocations". */
  it('nimmt das Kontingent aus der Stufentabelle', async () => {
    const allowances = await Promise.all(
      [1, 2, 5, 9, 20].map(async (l) => (await invocationOffer(l))?.allowance ?? 0),
    );
    expect(allowances).toEqual([1, 3, 5, 7, 10]);
  });

  it('stellt die 28 SRD-Optionen mit deutschem Label bereit', async () => {
    const offer = await invocationOffer(1);
    expect(offer?.titleDe).toBe('Schauerliche Anrufungen');
    expect(offer?.options).toHaveLength(28);
    expect(offer?.options.map((o) => o.value)).toContain('Pact of the Blade');
    expect(offer?.options.every((o) => o.labelDe.trim() && o.helpDe.trim())).toBe(true);
  });
});
