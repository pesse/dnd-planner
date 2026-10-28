/**
 * Zuschläge und Vorteil auf Fertigkeitswürfe aus dem ECHTEN Vault: am Merkmal und an der gewählten Option.
 *
 *   npm run test -- checksVault
 */
import { describe, expect, it } from 'vitest';
import { checkSources, skillCheckEffects } from '../../src/lib/services/abilityChecks';
import { ownedGrantFeatures } from '../../src/lib/services/hitPoints';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { SKILL_DEFS } from '../../src/lib/domain/skills';

const mods = { str: 3, dex: 1, con: 2, int: 0, wis: 3, cha: -1 };

async function effectsOf(c: Record<string, unknown>, en: string) {
  const character = characterSchema.parse({ name: 'Prüfling', ...c });
  const sources = checkSources(await ownedGrantFeatures(character));
  return skillCheckEffects(SKILL_DEFS.find((d) => d.en === en)!, sources, { mods, profBonus: 2 });
}

describe('Fertigkeitswürfe aus dem Vault', () => {
  it('Thaumaturg: WEI-Bonus auf Religion, nicht auf Geschichte', async () => {
    const cleric = {
      classes: [{ sourceKey: 'srd-2024_cleric', name: 'Kleriker', level: 1 }],
      features: [{ sourceKey: 'srd-2024_cleric_divine-order', name: 'Göttliche Ordnung', choice: 'Thaumaturge', choiceDe: 'Thaumaturg' }],
    };
    expect((await effectsOf(cleric, 'Religion')).rows).toEqual([{ labelDe: expect.stringContaining('Thaumaturg'), value: 3 }]);
    expect((await effectsOf(cleric, 'History')).rows).toEqual([]);
  });

  it('Barbar: Vorteil auf Athletik nur im Kampfrausch', async () => {
    const fx = await effectsOf({ classes: [{ sourceKey: 'srd-2024_barbarian', name: 'Barbar', level: 1 }] }, 'Athletics');
    expect(fx.advantage).toBe(false);
    expect(fx.notes).toContainEqual(expect.stringContaining('solange dein Kampfrausch aktiv ist'));
  });
});
