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
    expect(slotsFor(weapon('Quarterstaff', { index: 'quarterstaff' }))).toEqual(['back', 'hipRight', 'hipLeft']);
  });

  it('Bogen auf den Rücken, Handarmbrust und Wurfpfeile an den Gürtel, Köcher und Munition wählbar', () => {
    expect(slotsFor(weapon('Longbow', { properties: TWO_HANDED }))).toEqual(['back']);
    expect(slotsFor(weapon('Hand Crossbow'))).toEqual(['hipRight', 'hipLeft', 'back']);
    expect(slotsFor(weapon('Dart'))).toEqual(['hipRight', 'hipLeft', 'back']);
    expect(slotsFor(info('Quiver', { category: 'adventuring-gear' }))).toEqual(['back', 'hipRight', 'hipLeft']);
    expect(slotsFor(info('Arrows (20)', { category: 'ammunition' }))).toEqual(['back', 'hipRight', 'hipLeft']);
  });

  it('erkennt Wundersames am englischen Namen, ein deklarierter Platz geht vor', () => {
    expect(slotsFor(info('Boots of Elvenkind'))).toEqual(['feet']);
    expect(slotsFor(info('Cloak of Protection'))).toEqual(['shoulders']);
    expect(slotsFor(info('Ioun Stone'))).toEqual(['other']);
    expect(slotsFor(info('Bag of Holding', { slot: 'waist' }))).toEqual(['waist']);
  });
});

describe('placeEquipment', () => {
  it('verteilt Waffen über beide Gürtelseiten, Stiefel und Rücken', () => {
    const d = weapon('Dagger', { index: 'dagger' });
    expect(where(lines(weapon('Longsword'), weapon('Mace'), d, d, d, d, weapon('Handaxe')))).toEqual({
      hipRight: ['Longsword', 'Mace'], hipLeft: ['Dagger', 'Dagger'], boot: ['Dagger', 'Dagger'], back: ['Handaxe'],
    });
  });

  it('begrenzt nichts: was nicht mehr passt, hängt dort, wo am wenigsten hängt', () => {
    const greatsword = weapon('Greatsword', { properties: TWO_HANDED });
    const placed = where(lines(SHIELD, greatsword, weapon('Longbow', { properties: TWO_HANDED }), weapon('Greataxe', { properties: TWO_HANDED })));
    expect(placed.back).toEqual(['Shield', 'Greatsword', 'Longbow', 'Greataxe']);
  });

  it('Munition landet beim Köcher, auch wenn er am Gürtel hängt', () => {
    const quiver = info('Quiver', { category: 'adventuring-gear' });
    expect(where(lines(info('Arrows (20)', { category: 'ammunition' }), [quiver, 'hipLeft']))).toEqual({
      hipLeft: ['Quiver', 'Arrows (20)'],
    });
  });

  it('vom zweiten Mantel trägt man keinen — der wird als Ersatz markiert', () => {
    const fills = placeEquipment(lines(info('Cloak of Protection'), info('Cloak of Elvenkind')));
    expect(fills.get('shoulders')?.items.map((p) => p.spare)).toEqual([false, true]);
    const rings = Array.from({ length: 8 }, (_, i) => info(`Ring ${i}`, { category: 'ring' }));
    expect(placeEquipment(lines(...rings)).get('ring')?.items.some((p) => p.spare)).toBe(false);
  });

  it('gewählte Plätze gehen vor', () => {
    expect(where(lines([weapon('Longsword'), 'back']))).toEqual({ back: ['Longsword'] });
  });
});
