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
  });

  it('Einhandwaffen an den Gürtel, Dolche auch in den Stiefel, Schild und Zweihänder auf den Rücken', () => {
    expect(slotsFor(weapon('Longsword'))).toEqual(['hipRight', 'hipLeft', 'back']);
    expect(slotsFor(weapon('Dagger', { index: 'dagger' }))).toEqual(['hipRight', 'hipLeft', 'boot', 'back']);
    expect(slotsFor(weapon('Greatsword', { properties: TWO_HANDED }))).toEqual(['back']);
    expect(slotsFor(SHIELD)).toEqual(['back']);
  });

  it('erkennt Wundersames am englischen Namen, ein deklarierter Platz geht vor', () => {
    expect(slotsFor(info('Boots of Elvenkind'))).toEqual(['feet']);
    expect(slotsFor(info('Cloak of Protection'))).toEqual(['shoulders']);
    expect(slotsFor(info('Bag of Holding'))).toEqual(['other']);
    expect(slotsFor(info('Bag of Holding', { slot: 'waist' }))).toEqual(['waist']);
  });
});

describe('placeEquipment', () => {
  it('verteilt Waffen auf Gürtel rechts und links, dann Stiefel und Rücken', () => {
    const d = weapon('Dagger', { index: 'dagger' });
    expect(where(lines(weapon('Longsword'), d, d, d, weapon('Spear')))).toEqual({
      hipRight: ['Longsword'], hipLeft: ['Dagger'], boot: ['Dagger', 'Dagger'], back: ['Spear'],
    });
  });

  it('Schild und Zweihandwaffe teilen sich den Rücken', () => {
    const greatsword = weapon('Greatsword', { properties: TWO_HANDED });
    const fills = placeEquipment(lines(SHIELD, greatsword));
    expect(fills.get('back')).toMatchObject({ used: 2, overfull: false });
  });

  it('gewählte Plätze gehen vor und melden Überbelegung', () => {
    const fills = placeEquipment(lines(
      [weapon('Longsword'), 'hipLeft'], [weapon('Shortsword'), 'hipLeft'],
    ));
    expect(fills.get('hipLeft')?.overfull).toBe(true);
  });

  it('zwei Rüstungen sind eine Überbelegung, acht Ringe nicht', () => {
    const armor = (n: string) => info(n, { category: 'armor', armor_category: 'Heavy' });
    expect(placeEquipment(lines(armor('Plate'), armor('Chain Mail'))).get('body')?.overfull).toBe(true);
    const rings = Array.from({ length: 8 }, (_, i) => info(`Ring ${i}`, { category: 'ring' }));
    expect(placeEquipment(lines(...rings)).get('ring')?.overfull).toBe(false);
  });
});
