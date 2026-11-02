/**
 *   npm run test -- ddbCreateEntries
 */
import { describe, expect, it } from 'vitest';
import { ddbCharacterJsonSchema } from '../../src/lib/schemas/ddbCharacterJson';
import { parseDdbJson } from '../../src/lib/services/ddbImport/parseJson';
import { featFromDdb, itemFromDdb } from '../../src/lib/services/ddbImport/createEntries';
import { itemSchema } from '../../src/lib/schemas/item';
import { featSchema } from '../../src/lib/schemas/feat';
import { ddbGnomeWizardJson } from '../fixtures/ddbCharacterJson';

const sheet = parseDdbJson(ddbCharacterJsonSchema.parse(ddbGnomeWizardJson()));

describe('Vault-Einträge aus D&D Beyond', () => {
  it('baut ein Talent unter der Import-Herkunft, ohne `grants`', () => {
    const feat = featFromDdb(sheet.features.find((f) => f.name === 'Inkbound Pact')!, 'inkwell-codex-import');
    expect(feat).toMatchObject({
      key: 'inkwell-codex-import_inkbound-pact', source: 'inkwell-codex-import', name: 'Inkbound Pact',
      document: { key: 'inkwell-codex-import' }, desc: expect.stringContaining('Once per long rest'),
    });
    expect(feat.grants).toBeUndefined();
    expect(() => featSchema.parse(JSON.parse(JSON.stringify(feat)))).not.toThrow();
  });

  it('baut einen Gegenstand mit Kategorie, Seltenheit und Absätzen', () => {
    const item = itemFromDdb(sheet.inventory.find((i) => i.name === 'Quill of Endless Ink')!, 'inkwell-codex-import');
    expect(item).toMatchObject({
      key: 'inkwell-codex-import_quill-of-endless-ink', equipment_category: { index: 'wondrous-item' },
      rarity: { name: 'Uncommon' }, desc: ['This quill never runs dry.'], source: 'inkwell-codex-import',
    });
    expect(() => itemSchema.parse(JSON.parse(JSON.stringify(item)))).not.toThrow();
  });

  it('übernimmt Waffenwerte', () => {
    const dagger = {
      ...sheet.inventory[0],
      detail: { ...sheet.inventory[0].detail!, damage: '1d4', damageType: 'Piercing', weaponCategoryId: 1, properties: ['Finesse', 'Light'] },
    };
    expect(itemFromDdb(dagger, 'homebrew-sam')).toMatchObject({
      equipment_category: { index: 'weapon' }, weapon_category: 'Simple', weapon_range: 'Melee',
      damage: { damage_dice: '1d4', damage_type: { name: 'Piercing' } }, properties: [{ index: 'finesse' }, { index: 'light' }],
    });
  });

  it('nimmt als Herkunft nur ein Kürzel, keinen Buchtitel', () => {
    expect(() => featSchema.parse({ name: 'X', source: 'The Crooked Moon' })).toThrow();
    expect(featSchema.parse({ name: 'X', source: 'crooked-moon-import' }).source).toBe('crooked-moon-import');
  });
});
