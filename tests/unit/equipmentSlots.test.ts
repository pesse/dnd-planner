/**
 * Plätze angelegter Gegenstände, ihre Verteilung und Überbelegung.
 *
 *   npm run test -- equipmentSlots
 */
import { describe, expect, it } from 'vitest';
import { placeEquipment, slotsFor } from '../../src/lib/services/equipmentSlots';
import type { ItemInfo } from '../../src/lib/itemLibrary';
import type { EquippedLine } from '../../src/lib/services/wornItems';
import type { EquipmentSlot } from '../../src/lib/schemas/equipmentSlot';

const info = (name: string, extra: Partial<ItemInfo> = {}): ItemInfo =>
  ({ name, category: 'wondrous-item', rarity: '—', path: '', magic: true, ...extra });
const weapon = (name: string, extra: Partial<ItemInfo> = {}) => info(name, { category: 'weapon', magic: false, ...extra });
const TWO_HANDED = [{ index: 'two-handed', name: 'Two-Handed' }];
const SHIELD = info('Shield', { category: 'armor', armor_category: 'Shield' });

const lines = (...items: (ItemInfo | [ItemInfo, EquipmentSlot])[]): EquippedLine[] =>
  items.map((x, line) => {
    const [item, slot] = Array.isArray(x) ? x : [x, undefined];
    return { line, item, effective: true, entry: { name: item.name, count: '', weight: '', equipped: true, slot } };
  });

const where = (ls: EquippedLine[]) => {
  const out: Record<string, string[]> = {};
  for (const f of placeEquipment(ls).values()) out[f.slot] = f.items.map((p) => p.item.name);
  return out;
};

describe('slotsFor', () => {
  it('leitet den Platz aus Kategorie und Rüstungsart ab', () => {
    expect(slotsFor(info('Plate Armor', { category: 'armor', armor_category: 'Heavy' }))).toEqual(['body']);
    expect(slotsFor(info('Ring of Protection', { category: 'ring' }))).toEqual(['ring']);
    expect(slotsFor(SHIELD)).toEqual(['offHand', 'mainHand', 'back']);
  });

  it('Einhandwaffen in jede Hand oder auf den Rücken, Dolche auch in den Stiefel', () => {
    expect(slotsFor(weapon('Longsword'))).toEqual(['mainHand', 'offHand', 'back']);
    expect(slotsFor(weapon('Dagger', { index: 'dagger' }))).toEqual(['mainHand', 'offHand', 'boot', 'back']);
    expect(slotsFor(weapon('Greatsword', { properties: TWO_HANDED }))).toEqual(['mainHand', 'back']);
  });

  it('erkennt Wundersames am englischen Namen, ein deklarierter Platz geht vor', () => {
    expect(slotsFor(info('Boots of Elvenkind'))).toEqual(['feet']);
    expect(slotsFor(info('Cloak of Protection'))).toEqual(['shoulders']);
    expect(slotsFor(info('Bag of Holding'))).toEqual(['other']);
    expect(slotsFor(info('Bag of Holding', { slot: 'waist' }))).toEqual(['waist']);
  });
});

describe('placeEquipment', () => {
  it('verteilt Waffen auf rechte und linke Hand, dann Stiefel und Rücken', () => {
    const d = weapon('Dagger', { index: 'dagger' });
    expect(where(lines(weapon('Longsword'), d, d, d, weapon('Spear')))).toEqual({
      mainHand: ['Longsword'], offHand: ['Dagger'], boot: ['Dagger', 'Dagger'], back: ['Spear'],
    });
  });

  it('Schild geht in die linke Hand; eine Zweihandwaffe daneben wandert auf den Rücken', () => {
    const greatsword = weapon('Greatsword', { properties: TWO_HANDED });
    expect(where(lines(SHIELD, greatsword))).toEqual({ offHand: ['Shield'], back: ['Greatsword'] });
  });

  it('Zweihandwaffe in der Hand blockiert die linke Hand', () => {
    const fills = placeEquipment(lines(weapon('Greatsword', { properties: TWO_HANDED })));
    expect(fills.get('offHand')).toMatchObject({ used: 1, overfull: false, items: [] });
    expect(fills.get('offHand')?.blockedBy?.item.name).toBe('Greatsword');
  });

  it('gewählte Plätze gehen vor und melden Überbelegung', () => {
    const fills = placeEquipment(lines(
      [weapon('Greatsword', { properties: TWO_HANDED }), 'mainHand'], [SHIELD, 'offHand'],
    ));
    expect(fills.get('offHand')?.overfull).toBe(true);
  });

  it('zwei Rüstungen sind eine Überbelegung, acht Ringe nicht', () => {
    const armor = (n: string) => info(n, { category: 'armor', armor_category: 'Heavy' });
    expect(placeEquipment(lines(armor('Plate'), armor('Chain Mail'))).get('body')?.overfull).toBe(true);
    const rings = Array.from({ length: 8 }, (_, i) => info(`Ring ${i}`, { category: 'ring' }));
    expect(placeEquipment(lines(...rings)).get('ring')?.overfull).toBe(false);
  });
});
