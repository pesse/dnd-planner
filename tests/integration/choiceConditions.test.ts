/**
 * Bedingte Talentwahlen und Pool-Bedingungen gegen den echten Vault: `when` und `swap` an der
 * Wahl, die Zauber der Anrufungen und was ein Aufstieg davon freischaltet.
 *
 *   npm run test -- choiceConditions
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type OptionPick } from '../../src/lib/schemas/characterSchema';
import { featuresUpTo, getProgressionByKey } from '../../src/lib/services/classProgression';
import { featUnlocks, type UnlockState } from '../../src/lib/services/levelUp/featUnlocks';
import { getFeats } from '../../src/lib/featsLibrary';
import { featCategoryOptions, pickableFeats } from '../../src/lib/services/fightingStyle';
import { activeQuotas } from '../../src/lib/services/spellcasting/quota';
import { resolveCasting } from '../../src/lib/services/spellcasting/resolve';
import { vaultFeatures } from '../support/vaultFeatures';

const WARLOCK = 'srd-2024_warlock';
const INVOCATIONS = `${WARLOCK}_eldritch-invocations`;

const pick = (value: string): OptionPick => ({ sourceKey: INVOCATIONS, value, valueDe: '' });
const NOTHING: UnlockState = { ledger: [], picks: [] };

async function classFeatures(classKey: string, level: number) {
  const prog = await getProgressionByKey(classKey);
  return featuresUpTo(prog!, level);
}

const warlock = (level: number, picks: string[]) =>
  characterSchema.parse({
    name: 'Prüfling Anrufung',
    classes: [{ sourceKey: WARLOCK, name: 'Hexenmeister', level }],
    optionPicks: picks.map(pick),
  });

async function invocationQuotas(level: number, picks: string[]) {
  const source = (await resolveCasting(warlock(level, picks))).sources.find((s) => s.featureKey === INVOCATIONS);
  return source ? activeQuotas(source) : [];
}

describe('Bedingungen an Wahlen im Vault', () => {
  it('trägt `when` und `swap` nur an Talentwahlen, mit bekannten Schlüsseln', async () => {
    for (const { id, feature } of await vaultFeatures()) {
      const choices = feature.grantsChoice ?? [];
      for (const g of choices) {
        if (g.kind !== 'featCategory') {
          expect(g.when, id).toBeUndefined();
          expect(g.swap, id).toBeUndefined();
        }
        const optionsOf = (kind: string) => choices.filter((c) => c.kind === kind).flatMap((c) => c.options.map((o) => o.value));
        const allowed: Record<string, string[]> = { option: optionsOf('optionList'), pick: optionsOf('optionPool') };
        for (const [key, value] of Object.entries(g.when ?? {})) {
          expect(Object.keys(allowed), id).toContain(key);
          expect(allowed[key], id).toContain(value);
        }
      }
    }
  });
});

describe('Anrufungen', () => {
  it('gewähren ohne Wahl keine Zauber', async () => {
    expect(await invocationQuotas(5, [])).toEqual([]);
  });

  it('wirken Schattenrüstung beliebig oft und Gabe der Tiefen einmal je Rast', async () => {
    const quotas = await invocationQuotas(5, ['Armor of Shadows', 'Gift of the Depths']);
    expect(quotas.map((q) => [q.id, q.pool.names, q.cast[0].kind])).toEqual([
      ['armorOfShadows', ['Mage Armor'], 'at-will'],
      ['giftOfTheDepths', ['Water Breathing'], 'uses'],
    ]);
  });

  it('geben dem Pakt des Buches drei Zaubertricks und zwei Rituale', async () => {
    const quotas = await invocationQuotas(1, ['Pact of the Tome']);
    expect(quotas.map((q) => [q.id, q.levels, q.pool.ritual])).toEqual([
      ['tomeCantrips', [0], false],
      ['tomeRituals', [1], true],
    ]);
  });
});

describe('Freischaltung im Aufstieg', () => {
  it('schaltet mit Lektionen der Ersten ein Herkunftstalent frei — einmal', async () => {
    const features = await classFeatures(WARLOCK, 3);
    const after: UnlockState = { ledger: [], picks: [pick('Lessons of the First Ones')] };
    expect(featUnlocks(features, { fromLevel: 2, toLevel: 3 }, NOTHING, after).conditional).toEqual([{ category: 'Origin', count: 1 }]);
    // Stand die Wahl schon vorher, ist nichts neu.
    expect(featUnlocks(features, { fromLevel: 2, toLevel: 3 }, after, after).conditional).toEqual([]);
  });

  it('bietet in der Herkunfts-Wahl nur Herkunftstalente an', async () => {
    const feats = await getFeats();
    const keys = featCategoryOptions(feats, 'Origin').map((o) => o.sourceKey);
    expect(keys).toContain('srd-2024_magic-initiate');
    const category = new Map(feats.map((f) => [f.sourceKey, f.category]));
    expect(keys.filter((k) => category.get(k) !== 'Origin')).toEqual([]);
  });

  it('markiert genau die Talente als wiederholbar, deren Regeltext es sagt', async () => {
    for (const f of await getFeats())
      expect(!!f.repeatable, f.sourceKey).toBe(/more than once/i.test(f.desc ?? ''));
  });

  it('lässt ein vorhandenes Talent nur wählen, wenn es wiederholbar ist', async () => {
    const options = featCategoryOptions(await getFeats(), 'Origin');
    const pickable = pickableFeats(options, ['srd-2024_magic-initiate', 'srd-2024_alert']).map((o) => o.sourceKey);
    expect(pickable).toContain('srd-2024_magic-initiate');
    expect(pickable).not.toContain('srd-2024_alert');
    expect(pickable).toHaveLength(options.length - 1);
  });

  it('gibt dem Paladin den Kampfstil erst im Talent-Zweig', async () => {
    const features = await classFeatures('srd-2024_paladin', 2);
    const answer = (choice: string): UnlockState => ({
      ledger: [{ sourceKey: 'srd-2024_paladin_fighting-style', choice }],
      picks: [],
    });
    const span = { fromLevel: 1, toLevel: 2 };
    expect(featUnlocks(features, span, NOTHING, answer('Fighting Style feat')).fightingStyle).toBe(1);
    expect(featUnlocks(features, span, NOTHING, answer('Blessed Warrior')).fightingStyle).toBe(0);
    expect(featUnlocks(features, span, NOTHING, NOTHING).fightingStyle).toBe(0);
  });

  it('lässt den Kämpfer seinen Kampfstil je Stufe tauschen, den neuen nicht', async () => {
    const fighter = 'srd-2024_fighter';
    expect(featUnlocks(await classFeatures(fighter, 1), { fromLevel: 0, toLevel: 1 }, NOTHING, NOTHING))
      .toEqual({ fightingStyle: 1, conditional: [], styleSwaps: 0 });
    expect(featUnlocks(await classFeatures(fighter, 2), { fromLevel: 1, toLevel: 2 }, NOTHING, NOTHING))
      .toEqual({ fightingStyle: 0, conditional: [], styleSwaps: 1 });
  });

  it('gibt dem Paladin keinen Tausch — sein Regeltext nennt keinen', async () => {
    const features = await classFeatures('srd-2024_paladin', 3);
    const fs: UnlockState = { ledger: [{ sourceKey: 'srd-2024_paladin_fighting-style', choice: 'Fighting Style feat' }], picks: [] };
    expect(featUnlocks(features, { fromLevel: 2, toLevel: 3 }, fs, fs).styleSwaps).toBe(0);
  });
});
