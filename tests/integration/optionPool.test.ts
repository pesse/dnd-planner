/**
 * Die Metamagie-Deklaration gegen den ECHTEN Vault. Der Kern ist die Trennlinie: der Pool
 * liefert ein ANGEBOT für den Editor und stellt KEINE Fragebogen-Frage — stünde er in beiden,
 * wäre die Wahl doppelt.
 *
 *   npm run test -- optionPool
 */
import { describe, expect, it } from 'vitest';
import { collectChoiceSlots } from '../../src/lib/services/characterChoices';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { withoutDeclaredChoiceFeatures } from '../../src/lib/services/declaration/optionList';
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

/**
 * Der Jäger ist der Fall, für den der Pool an der SUBKLASSE hängt und das Kontingent aus
 * `gainedAt` × `count` kommt: eine Option je Merkmal, jederzeit tauschbar — die Regel erlaubt
 * den Wechsel nach jeder Rast, und ein Fragebogen fragt nur einmal.
 */
describe('Beute des Jägers und Defensive Taktiken als Options-Pools', () => {
  const RANGER_KEY = 'srd-2024_ranger';
  const HUNTER_KEY = 'srd-2024_hunter';
  const PREY_KEY = 'srd-2024_ranger_hunter_hunters-prey';
  const TACTICS_KEY = 'srd-2024_ranger_hunter_defensive-tactics';

  const hunter = (level: number) => ({
    classes: [{ sourceKey: RANGER_KEY, subclassKey: HUNTER_KEY, name: 'Waldläufer', level }],
  });

  const offerAt = async (level: number, key: string) =>
    (await optionPoolOffers(hunter(level))).find((o) => o.featureKey === key);

  it('bietet je eine Option ab der Vergabe-Stufe an', async () => {
    const prey = await Promise.all([2, 3, 20].map(async (l) => (await offerAt(l, PREY_KEY))?.allowance ?? 0));
    const tactics = await Promise.all([6, 7, 20].map(async (l) => (await offerAt(l, TACTICS_KEY))?.allowance ?? 0));
    expect(prey).toEqual([0, 1, 1]);
    expect(tactics).toEqual([0, 1, 1]);
  });

  it('nennt beide Optionen mit deutschem Label und Konsequenz', async () => {
    const offer = await offerAt(3, PREY_KEY);
    expect(offer?.titleDe).toBe('Beute des Jägers');
    expect(offer?.className).toBe('Waldläufer');
    expect(offer?.options.map((o) => o.value)).toEqual(['Colossus Slayer', 'Horde Breaker']);
    expect(offer?.options.map((o) => o.labelDe)).toEqual(['Kolossbezwinger', 'Meutebrecher']);
    expect(offer?.options.every((o) => o.helpDe.trim())).toBe(true);
  });

  it('stellt keinen Wahl-Platz mehr in der Merkmalsleiste', async () => {
    const { slots } = await collectChoiceSlots(hunter(7));
    expect(slots.filter((s) => s.feature.key === PREY_KEY || s.feature.key === TACTICS_KEY)).toEqual([]);
  });

  /** Sonst beschriebe Pass C beide Optionen ein zweites Mal, neben dem Pool-Kasten des Bogens. */
  it('hält die Merkmale aus dem KI-Notiz-Eingang heraus', async () => {
    const prog = await getProgressionByKey(HUNTER_KEY);
    const pooled = prog!.features.filter((f) => f.key === PREY_KEY || f.key === TACTICS_KEY);
    expect(pooled, 'beide Merkmale im Vault').toHaveLength(2);
    expect(withoutDeclaredChoiceFeatures(pooled)).toEqual([]);
  });
});
