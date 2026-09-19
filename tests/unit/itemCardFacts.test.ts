/**
 * Der Inhalt einer Gegenstandskarte — dasselbe Bündel für die große Einzelkarte und die
 * 70×99-Karte des Bogens, die nur enger gesetzt ist.
 *
 *   npm run test -- itemCardFacts
 */
import { describe, expect, it } from 'vitest';
import { itemCardFacts } from '../../src/lib/utils/itemCardFacts';
import type { Item } from '../../src/lib/types';

const item = (over: Partial<Item>): Item => ({
  key: 'srd-2024_longsword',
  name: 'Longsword',
  name_de: 'Langschwert',
  equipment_category: { index: 'weapon', name: 'Weapon' },
  desc: ['A versatile blade.'],
  desc_de: ['Eine vielseitige Klinge.'],
  source: 'srd-2024',
  document: { key: 'srd-2024', gamesystem: '' },
  ...over,
} as Item);

const longsword = item({
  weapon_category: 'Martial',
  weapon_range: 'Melee',
  damage: { damage_dice: '1d8', damage_type: { index: 'slashing', name: 'Slashing' } },
  mastery: 'Sap',
  cost: { quantity: 15, unit: 'gp' },
  weight: 3,
} as Partial<Item>);

describe('Gegenstandskarte', () => {
  it('nimmt die deutsche Beschreibung, nie beide', () => {
    expect(itemCardFacts(longsword).description).toBe('Eine vielseitige Klinge.');
    expect(itemCardFacts(item({ desc_de: [] })).description).toBe('A versatile blade.');
  });

  it('setzt Titel, Originalnamen und Fuß aus Quelle und Preis', () => {
    const f = itemCardFacts(longsword);

    expect(f.title).toBe('Langschwert');
    expect(f.nameEn).toBe('Longsword');
    expect(f.source).toBe('srd-2024');
    expect(f.price).toBe('15 GM · 3 Pfd.');
    // Ohne deutschen Namen steht der Originalname im Titel und nicht zweimal.
    expect(itemCardFacts(item({ name_de: undefined })).nameEn).toBe('');
  });

  it('schreibt die Meisterschaft nur auf der großen Karte aus', () => {
    const wide = itemCardFacts(longsword).rows.join('');
    const compact = itemCardFacts(longsword, true).rows.join('');

    expect(wide).toContain('Auslaugen');
    expect(wide).toContain('Nachteil');
    expect(compact).toContain('Auslaugen');
    // Der Regeltext verdrängte auf der kleinen Karte die Beschreibung.
    expect(compact).not.toContain('Nachteil');
  });

  it('führt Waffenwerte deutsch und Rüstungswerte getrennt', () => {
    const weapon = itemCardFacts(longsword);
    const armor = itemCardFacts(item({
      equipment_category: { index: 'armor', name: 'Armor' },
      armor_category: 'Heavy',
      armor_class: { base: 18, dex_bonus: false },
      stealth_disadvantage: true,
      str_minimum: 15,
    } as Partial<Item>));

    expect(weapon.subtype).toBe('Kriegswaffe · Nahkampf');
    expect(weapon.rows.join('')).toContain('1W8 Hieb');
    expect(armor.subtype).toBe('Schwere Rüstung');
    expect(armor.rows.join('')).toContain('18');
    expect(armor.rows.join('')).toContain('mind. 15');
    expect(armor.rows.join('')).toContain('disadv');
  });

  it('gibt einem Gegenstand ohne Spielwerte keine Wertezeilen', () => {
    const potion = item({
      equipment_category: { index: 'potion', name: 'Potion' },
      rarity: { name: 'Uncommon' },
      attunement: true,
    } as Partial<Item>);
    const f = itemCardFacts(potion);

    expect(f.rows).toEqual([]);
    expect(f.meta).toContain('Ungewöhnlich');
    expect(f.attune).toBe('Einstimmung erforderlich');
  });
});
