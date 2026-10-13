/**
 * Kampfstil ODER Sonderoption (Gesegneter/Druidischer Krieger) gegen den echten Vault: EINE
 * Zweigwahl, an der Talentwahl und Zauberkontingent je mit `when.option` hängen.
 *
 *   npm run test -- fightingStyleBranch
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { fightingStyleOffer } from '../../src/lib/services/fightingStyle';
import { resolveCasting } from '../../src/lib/services/spellcasting/resolve';
import { activeQuotas } from '../../src/lib/services/spellcasting/quota';

const PALADIN = 'srd-2024_paladin';
const RANGER = 'srd-2024_ranger';

const warrior = (classKey: string, answer = ''): Character =>
  characterSchema.parse({
    name: 'Prüfling Kampfstil',
    classes: [{ sourceKey: classKey, name: classKey, level: 2 }],
    features: answer
      ? [{ sourceKey: `${classKey}_fighting-style`, name: '', choice: answer, gainedAt: 2, desc: '' }]
      : [],
  });

const styleAllowance = async (c: Character) =>
  (await fightingStyleOffer({ classes: c.classes, features: c.features, optionPicks: c.optionPicks })).allowance;

const branchQuotas = async (c: Character, classKey: string) => {
  const source = (await resolveCasting(c)).sources.find((s) => s.featureKey === `${classKey}_fighting-style`);
  return source ? activeQuotas(source).map((q) => q.id) : [];
};

describe('Kampfstil-Zweig', () => {
  it('bietet ohne Antwort weder Talent noch Zaubertricks an', async () => {
    const c = warrior(PALADIN);
    expect(await styleAllowance(c)).toBe(0);
    expect(await branchQuotas(c, PALADIN)).toEqual([]);
  });

  it('gibt im Talent-Zweig genau ein Kampfstil-Talent', async () => {
    const c = warrior(PALADIN, 'Fighting Style feat');
    expect(await styleAllowance(c)).toBe(1);
    expect(await branchQuotas(c, PALADIN)).toEqual([]);
  });

  it('gibt dem Gesegneten Krieger zwei Kleriker-Zaubertricks mit Charisma', async () => {
    const c = warrior(PALADIN, 'Blessed Warrior');
    expect(await styleAllowance(c)).toBe(0);
    const source = (await resolveCasting(c)).sources.find((s) => s.featureKey === `${PALADIN}_fighting-style`)!;
    const [quota] = activeQuotas(source);
    expect(quota.pool.lists).toEqual(['cleric']);
    expect(quota.count).toMatchObject({ base: 2 });
    expect(source.ability?.fixed).toBe('Charisma');
  });

  it('gibt dem Druidischen Krieger Druiden-Zaubertricks mit Weisheit', async () => {
    const c = warrior(RANGER, 'Druidic Warrior');
    expect(await styleAllowance(c)).toBe(0);
    const source = (await resolveCasting(c)).sources.find((s) => s.featureKey === `${RANGER}_fighting-style`)!;
    expect(activeQuotas(source).map((q) => q.pool.lists)).toEqual([['druid']]);
    expect(source.ability?.fixed).toBe('Wisdom');
  });

  it('lässt den unbedingten Kampfstil des Kämpfers unberührt', async () => {
    expect(await styleAllowance(warrior('srd-2024_fighter'))).toBe(1);
  });
});
