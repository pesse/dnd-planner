/**
 * RK aus dem ECHTEN Vault: Rüstung, Schild und Schutzgegenstände über den Inventar-Ladepfad,
 * Ungerüstete Verteidigung und Kampfstil über die Merkmals-Links.
 *
 *   npm run test -- armorClassVault
 */
import { describe, expect, it } from 'vitest';
import { armorClassDerivation } from '../../src/lib/services/armorClass';
import { ownedGrantFeatures } from '../../src/lib/services/hitPoints';
import { wornItems } from '../../src/lib/services/wornItems';
import { characterSchema, type CharacterInventoryEntry } from '../../src/lib/schemas/characterSchema';
import type { AbilityScores } from '../../src/lib/schemas/abilities';

const worn = (sourceKey: string, attuned = true): CharacterInventoryEntry =>
  ({ name: '', sourceKey, count: '1', weight: '', equipped: true, attuned });

const mods = (m: Partial<AbilityScores>): AbilityScores => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, ...m });

async function acOf(c: Record<string, unknown>, m: Partial<AbilityScores>) {
  const character = characterSchema.parse({ name: 'Prüfling', ...c });
  return armorClassDerivation({
    ac: character.ac,
    worn: await wornItems(character.inventory),
    features: await ownedGrantFeatures(character),
    mods: mods(m),
  });
}

describe('RK aus dem Vault', () => {
  it('Kämpferin mit Kettenpanzer, Schild, Ring des Schutzes und Kampfstil Verteidigung', async () => {
    const d = await acOf({
      classes: [{ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level: 1 }],
      features: [{ sourceKey: 'srd-2024_defense', name: 'Verteidigung' }],
      inventory: [worn('srd-2024_chain-mail'), worn('srd-2024_shield'), worn('srd-2024_ring-of-protection')],
    }, { dex: 1 });
    expect(d.total).toBe(16 + 2 + 1 + 1);
  });

  it('ohne Einstimmung wirkt der Ring nicht', async () => {
    const d = await acOf({ inventory: [worn('srd-2024_ring-of-protection', false)] }, { dex: 2 });
    expect(d.total).toBe(12);
  });

  it('magische Schilde tragen ihren Schildwert', async () => {
    const d = await acOf({ inventory: [worn('srd-2024_arrow-catching-shield')] }, {});
    expect(d.total).toBe(12);
  });

  it('Barbar mit Ungerüsteter Verteidigung und Schild', async () => {
    const d = await acOf({
      classes: [{ sourceKey: 'srd-2024_barbarian', name: 'Barbar', level: 1 }],
      inventory: [worn('srd-2024_shield')],
    }, { dex: 2, con: 3 });
    expect(d.total).toBe(10 + 2 + 3 + 2);
  });

  it('Mönch mit Ungerüsteter Verteidigung', async () => {
    const d = await acOf({ classes: [{ sourceKey: 'srd-2024_monk', name: 'Mönch', level: 1 }] }, { dex: 3, wis: 2 });
    expect(d.total).toBe(15);
  });
});
