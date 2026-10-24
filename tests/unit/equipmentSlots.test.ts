/**
 * Plätze angelegter Gegenstände und Überbelegung.
 *
 *   npm run test -- equipmentSlots
 */
import { describe, expect, it } from 'vitest';
import { fillSlots, slotOf } from '../../src/lib/services/equipmentSlots';
import type { ItemInfo } from '../../src/lib/itemLibrary';

const info = (name: string, extra: Partial<ItemInfo> = {}): ItemInfo =>
  ({ name, category: 'wondrous-item', rarity: '—', path: '', magic: true, ...extra });
const worn = (item: ItemInfo) => ({ id: item.name, item });

describe('slotOf', () => {
  it('leitet den Platz aus Kategorie und Rüstungsart ab', () => {
    expect(slotOf(info('Plate Armor', { category: 'armor', armor_category: 'Heavy' }))).toBe('body');
    expect(slotOf(info('Shield', { category: 'armor', armor_category: 'Shield' }))).toBe('hands');
    expect(slotOf(info('Ring of Protection', { category: 'ring' }))).toBe('ring');
    expect(slotOf(info('Longsword', { category: 'weapon' }))).toBe('hands');
  });

  it('erkennt Wundersames am englischen Namen', () => {
    expect(slotOf(info('Boots of Elvenkind'))).toBe('feet');
    expect(slotOf(info('Cloak of Protection'))).toBe('shoulders');
    expect(slotOf(info('Amulet of Health'))).toBe('neck');
    expect(slotOf(info('Bag of Holding'))).toBe('other');
  });

  it('nimmt einen deklarierten Platz vor der Ableitung', () => {
    expect(slotOf(info('Bag of Holding', { slot: 'waist' }))).toBe('waist');
  });
});

describe('fillSlots', () => {
  it('meldet zwei Rüstungen als Überbelegung', () => {
    const fills = fillSlots([
      worn(info('Plate Armor', { category: 'armor', armor_category: 'Heavy' })),
      worn(info('Chain Mail', { category: 'armor', armor_category: 'Heavy' })),
    ]);
    expect(fills.get('body')).toMatchObject({ used: 2, capacity: 1, overfull: true });
  });

  it('zählt eine Zweihandwaffe als beide Hände', () => {
    const greatsword = info('Greatsword', { category: 'weapon', properties: [{ index: 'two-handed', name: 'Two-Handed' }] });
    const shield = info('Shield', { category: 'armor', armor_category: 'Shield' });
    expect(fillSlots([worn(greatsword)]).get('hands')?.overfull).toBe(false);
    expect(fillSlots([worn(greatsword), worn(shield)]).get('hands')).toMatchObject({ used: 3, overfull: true });
  });

  it('erlaubt zwei Ringe, aber keinen dritten', () => {
    const rings = ['A', 'B', 'C'].map((n) => worn(info(`Ring ${n}`, { category: 'ring' })));
    expect(fillSlots(rings.slice(0, 2)).get('ring')?.overfull).toBe(false);
    expect(fillSlots(rings).get('ring')?.overfull).toBe(true);
  });
});
