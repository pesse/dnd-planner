/**
 * Übung im Gegenstands-Tooltip (#75): Waffen über die Waffenübung, Rüstung und Schild über
 * die Häkchen, dazu der GES-Anteil einer Rüstung an der RK.
 */
import { describe, expect, it } from 'vitest';
import { itemTraining, itemTrainingNote } from '../../src/lib/services/itemProficiency';
import { armorDexBonus } from '../../src/lib/services/armorClass';
import { emptyProficiencies } from '../../src/lib/schemas/characterSchema';
import type { ItemInfo } from '../../src/lib/itemLibrary';

const item = (over: Partial<ItemInfo>): ItemInfo => ({
  name: 'x', category: 'weapon', rarity: '—', path: 'x.json', key: 'x', magic: false, ...over,
});

const shortsword = item({ name: 'Shortsword', index: 'shortsword', weapon_category: 'Martial' });
const leather = item({ category: 'armor', armor_category: 'Light', armor_class: { base: 11, dex_bonus: true, max_bonus: null } });
const breastplate = item({ category: 'armor', armor_category: 'Medium', armor_class: { base: 14, dex_bonus: true, max_bonus: 2 } });
const plate = item({ category: 'armor', armor_category: 'Heavy', armor_class: { base: 18, dex_bonus: false, max_bonus: null } });
const shield = item({ category: 'armor', armor_category: 'Shield', armor_class: { base: 2, dex_bonus: false, max_bonus: null } });

describe('itemTraining', () => {
  it('fragt bei Waffen die Waffenübung, auch die einzeln erklärte', () => {
    const rogue = { ...emptyProficiencies(), simpleWeapons: true, individualWeapons: ['Shortsword'] };
    expect(itemTraining(shortsword, rogue)).toBe(true);
    expect(itemTraining(shortsword, emptyProficiencies())).toBe(false);
  });

  it('fragt bei Rüstung und Schild das passende Häkchen', () => {
    const prof = { ...emptyProficiencies(), lightArmor: true, shields: true };
    expect(itemTraining(leather, prof)).toBe(true);
    expect(itemTraining(breastplate, prof)).toBe(false);
    expect(itemTraining(shield, prof)).toBe(true);
  });

  it('schweigt bei Gegenständen ohne Übung', () => {
    expect(itemTraining(item({ category: 'potion' }), emptyProficiencies())).toBeUndefined();
  });
});

describe('armorDexBonus', () => {
  it('zählt GES voll, gedeckelt oder gar nicht', () => {
    expect(armorDexBonus(leather, 4)).toBe(4);
    expect(armorDexBonus(breastplate, 4)).toBe(2);
    expect(armorDexBonus(breastplate, -1)).toBe(-1);
    expect(armorDexBonus(plate, 4)).toBeNull();
  });
});

describe('itemTrainingNote', () => {
  it('gibt bei Rüstung den gedeckelten GES-Anteil mit', () => {
    const prof = { ...emptyProficiencies(), mediumArmor: true };
    expect(itemTrainingNote(breastplate, prof, 3)).toEqual({ proficient: true, dexBonus: 2 });
    expect(itemTrainingNote(plate, prof, 3)).toMatchObject({ proficient: false, dexBonus: null });
  });

  it('nennt die Folge fehlender Übung, beim Schild ohne GES', () => {
    expect(itemTrainingNote(shield, emptyProficiencies(), 3)).toEqual({
      proficient: false, untrainedDe: 'kein RK-Bonus durch den Schild',
    });
  });
});
