/**
 * Bibliotheksgewichte sind Pfund, Inventarzeilen kg — Übernahme und Korrektur des Bestands.
 *
 *   npm run test -- inventoryWeight
 */
import { describe, expect, it } from 'vitest';
import { holdsPoundWeight, libraryWeightKg, totalWeightKg } from '../../src/lib/utils/inventoryWeight';
import { inventoryWeightFix, type LegacyLinkLibraries, type LegacyLinkTarget } from '../../src/lib/services/characterLegacyLinks';
import { buildItemIndex, type ItemInfo } from '../../src/lib/itemLibrary';
import type { Character } from '../../src/lib/schemas/characterSchema';

type Line = Character['inventory'][number];

const PACK: ItemInfo = {
  key: 'srd-2024_explorers-pack', name: "Explorer's Pack", name_de: 'Entdeckerausrüstung',
  category: 'adventuring-gear', path: 'adventuring-gear/explorers-pack.json', rarity: 'Common', magic: false, weight: 55,
};
const DIE: ItemInfo = {
  key: 'srd-2024_dice-set', name: 'Dice Set', name_de: 'Würfelspiel',
  category: 'adventuring-gear', path: 'adventuring-gear/dice-set.json', rarity: 'Common', magic: false,
};
const libs = { items: buildItemIndex({ 'adventuring-gear': [PACK, DIE] }) } as unknown as LegacyLinkLibraries;

const line = (extra: Partial<Line>): Line => ({ name: 'Entdeckerausrüstung', count: '', weight: '', ...extra }) as Line;
/** Nur das Feld, das `inventoryWeightFix` liest. */
const target = (inventory: Line[]) => ({ inventory }) as unknown as LegacyLinkTarget;

describe('libraryWeightKg', () => {
  it('rechnet wie das deutsche SRD mit ½ kg je Pfund', () => {
    expect(libraryWeightKg(55)).toBe('27,5');
    expect(libraryWeightKg(0.25)).toBe('0,125');
    expect(totalWeightKg([{ weight: libraryWeightKg(55), count: '2' }])).toBe(55);
  });

  it('lässt Gegenstände ohne Gewicht leer', () => {
    expect(libraryWeightKg(undefined)).toBe('');
    expect(libraryWeightKg(null)).toBe('');
  });
});

describe('holdsPoundWeight', () => {
  it('erkennt nur die unveränderte Pfundzahl', () => {
    expect(holdsPoundWeight({ weight: '55' }, 55)).toBe(true);
    expect(holdsPoundWeight({ weight: '27,5' }, 55)).toBe(false);
    expect(holdsPoundWeight({ weight: '0' }, 0)).toBe(false);
  });
});

describe('inventoryWeightFix', () => {
  it('rechnet verknüpfte Zeilen mit Pfundzahl um und ist danach erledigt', () => {
    const t = target([line({ sourceKey: PACK.key, weight: '55' })]);
    const fix = inventoryWeightFix(t, libs)!;
    expect(fix.label).toBe('1 Gewicht aus der Bibliothek von Pfund in kg umrechnen');
    fix.apply();
    expect(t.inventory[0].weight).toBe('27,5');
    expect(inventoryWeightFix(t, libs)).toBeUndefined();
  });

  it('lässt getippte Gewichte unverknüpfter Zeilen und schon umgerechnete in Ruhe', () => {
    expect(inventoryWeightFix(target([line({ weight: '55' })]), libs)).toBeUndefined();
    expect(inventoryWeightFix(target([line({ sourceKey: PACK.key, weight: '27,5' })]), libs)).toBeUndefined();
    expect(inventoryWeightFix(target([line({ sourceKey: DIE.key, name: 'Würfelspiel' })]), libs)).toBeUndefined();
  });
});
