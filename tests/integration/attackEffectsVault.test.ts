/**
 * Angriffswirkungen aus dem ECHTEN Vault: Kampfstil über den Talent-Link, Armreifen über den
 * Inventar-Ladepfad, `magic_bonus` benannter Waffen aus dem Regeltext.
 *
 *   npm run test -- attackEffectsVault
 */
import { describe, expect, it } from 'vitest';
import { loadDeclaredAttackEffects } from '../../src/lib/services/attackEffects';
import { buildAttackFromWeapon, computeAttackBonus, computeAttackDamage } from '../../src/lib/services/attackCalc';
import { buildItemIndex, getAllItemsByDir, matchItem } from '../../src/lib/itemLibrary';
import { characterSchema, type CharacterInventoryEntry } from '../../src/lib/schemas/characterSchema';
import type { WeaponProficiencies } from '../../src/lib/services/weaponProficiency';

const worn = (sourceKey: string, attuned = true): CharacterInventoryEntry =>
  ({ name: '', sourceKey, count: '1', weight: '', equipped: true, attuned });

const MARTIAL: WeaponProficiencies = { simpleWeapons: true, martialWeapons: true };

async function weapon(key: string) {
  const hit = matchItem(buildItemIndex(await getAllItemsByDir()), { sourceKey: key, name: '' });
  if (!hit) throw new Error(`${key} fehlt im Vault`);
  return hit;
}

describe('Angriffswirkungen aus dem Vault', () => {
  it('Bogenschießen und Armreifen der Bogenschützen auf dem Langbogen', async () => {
    const c = characterSchema.parse({
      name: 'Prüfling',
      features: [{ sourceKey: 'srd-2024_archery', name: 'Bogenschießen' }],
      inventory: [worn('srd-2024_bracers-of-archery'), worn('srd-2024_longbow')],
    });
    const ctx = { strMod: 0, dexMod: 3, proficiencyBonus: 2, declared: await loadDeclaredAttackEffects(c) };
    const a = buildAttackFromWeapon(await weapon('srd-2024_longbow'), { ...ctx, proficiencies: MARTIAL });
    expect(computeAttackBonus(a, ctx)).toBe('+7');
    expect(computeAttackDamage(a, ctx)).toBe('1W8+5');
  });

  it('nicht eingestimmte Armreifen wirken nicht', async () => {
    const c = characterSchema.parse({ name: 'Prüfling', inventory: [worn('srd-2024_bracers-of-archery', false)] });
    const ctx = { strMod: 0, dexMod: 3, proficiencyBonus: 2, declared: await loadDeclaredAttackEffects(c) };
    const a = buildAttackFromWeapon(await weapon('srd-2024_longbow'), { ...ctx, proficiencies: MARTIAL });
    expect(computeAttackDamage(a, ctx)).toBe('1W8+3');
  });

  it('die Berserker-Streitaxt bringt ihren +1 aus dem Regeltext mit', async () => {
    const axe = await weapon('srd-2024_berserker-battleaxe');
    expect(axe.magic_bonus).toBe(1);
    const a = buildAttackFromWeapon(axe, { strMod: 3, dexMod: 0, proficiencyBonus: 2, proficiencies: MARTIAL });
    expect(a.bonus).toBe('+6');
  });
});
