/**
 * Plätze angelegter Gegenstände, ihre Verteilung und Überbelegung.
 *
 *   npm run test -- equipmentSlots
 */
import { describe, expect, it } from 'vitest';
import { placeEquipment, slotsFor } from '../../src/lib/services/equipmentSlots';
import { equipmentQuips } from '../../src/lib/services/equipmentQuips';
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

  it('Pfeile stecken im Köcher, Bolzen im Bolzenkasten — auch ohne Häkchen', () => {
    const quiver = info('Quiver', { category: 'adventuring-gear' });
    const boltCase = info('Case, Crossbow Bolt', { category: 'adventuring-gear' });
    const arrows = info('Arrows (20)', { category: 'ammunition' });
    const bolts = info('Bolts (20)', { category: 'ammunition' });
    const ls = lines(quiver, boltCase, arrows, bolts);
    ls[2].entry.equipped = undefined;
    const fills = placeEquipment(ls);
    const [q, c] = fills.get('back')!.items;
    expect(q.contents?.map((p) => p.item.name)).toEqual(['Arrows (20)']);
    expect(c.contents?.map((p) => p.item.name)).toEqual(['Bolts (20)']);
    expect([...fills.values()].flatMap((f) => f.items).some((p) => p.item.category === 'ammunition')).toBe(false);
  });

  it('ohne Köcher hängt angelegte Munition am Gürtel, nicht angelegte gar nicht', () => {
    const arrows = info('Arrows (20)', { category: 'ammunition' });
    const ls = lines(arrows, arrows);
    ls[1].entry.equipped = undefined;
    expect(where(ls)).toEqual({ hipRight: ['Arrows (20)'] });
  });

  it('lässt alles zu und kommentiert es nur', () => {
    const cloaks = placeEquipment(lines(info('Cloak of Protection'), info('Cloak of Elvenkind')));
    expect(cloaks.get('shoulders')?.items).toHaveLength(2);
    expect(equipmentQuips(cloaks)).toEqual([
      'Cloak of Protection und Cloak of Elvenkind flattern gemeinsam dramatisch im Wind. Der Barde ist neidisch, das Regelwerk lässt nur einen wirken.',
    ]);
    const d = weapon('Dagger', { index: 'dagger' });
    expect(equipmentQuips(placeEquipment(lines(...Array.from({ length: 3 }, (): [ItemInfo, EquipmentSlot] => [d, 'boot'])))))
      .toEqual(['3 Dolche im Stiefelschaft: Jeder Schritt ist eine kleine Mutprobe.']);
    const rings = Array.from({ length: 8 }, (_, i) => info(`Ring ${i}`, { category: 'ring' }));
    expect(equipmentQuips(placeEquipment(lines(...rings)))).toEqual([]);
  });

  it('gewählte Plätze gehen vor', () => {
    expect(where(lines([weapon('Longsword'), 'back']))).toEqual({ back: ['Longsword'] });
  });
});
