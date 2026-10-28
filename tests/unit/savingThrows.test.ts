/**
 * Rettungswürfe aus Mod, Übung und Deklarationen; Auren aus den Beiträgen der Merkmale.
 *
 *   npm run test -- savingThrows
 */
import { describe, expect, it } from 'vitest';
import { savingThrowDerivations, savingThrowSources, type SavingThrowFeature } from '../../src/lib/services/savingThrows';
import { auraLinesDe, characterAuras } from '../../src/lib/services/auras';
import type { ItemInfo } from '../../src/lib/itemLibrary';
import type { WornItem } from '../../src/lib/services/wornItems';
import { featureGrantSchema } from '../../src/lib/schemas/grants';
import type { AbilityScores } from '../../src/lib/schemas/abilities';

const mods = (m: Partial<AbilityScores>): AbilityScores => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, ...m });
const noProfs = { str: false, dex: false, con: false, int: false, wis: false, cha: false };

const feature = (key: string, name: string, grants: unknown): SavingThrowFeature =>
  ({ key, name, grants: featureGrantSchema.parse(grants) });

const PROTECTION = 'srd-2024_paladin_aura-of-protection';
const AURA_OF_PROTECTION = feature(PROTECTION, 'Aura des Schutzes', {
  aura: [{ aura: PROTECTION, radiusFeet: 10, savingThrows: { abilityMod: 'Charisma', min: 1 } }],
});
const AURA_OF_COURAGE = feature('srd-2024_paladin_aura-of-courage', 'Aura der Tapferkeit', {
  aura: [{ aura: PROTECTION, conditionImmunities: ['frightened'] }],
});
const AURA_EXPANSION = feature('srd-2024_paladin_aura-expansion', 'Aura-Ausdehnung', {
  aura: [{ aura: PROTECTION, radiusFeet: 30 }],
});

const CLOAK: WornItem = {
  id: 'cloak-of-protection',
  item: {
    key: 'cloak-of-protection', name: 'Cloak of Protection', name_de: 'Mantel des Schutzes',
    category: 'wondrous-item', rarity: 'Uncommon', path: '', magic: true,
    savingThrowEffects: [{ kind: 'bonus', value: 1, abilities: [] }],
  },
};

const rows = (d: { rows: { labelDe: string; value: number }[] }) => d.rows.map((r) => [r.labelDe, r.value]);

describe('characterAuras', () => {
  it('führt die Beiträge zu EINER Aura zusammen: größter Radius, Name des erzeugenden Merkmals', () => {
    const [aura, ...rest] = characterAuras([AURA_OF_COURAGE, AURA_OF_PROTECTION, AURA_EXPANSION], { mods: mods({ cha: 2 }), profBonus: 3 });
    expect(rest).toEqual([]);
    expect(aura).toMatchObject({ nameDe: 'Aura des Schutzes', radiusFeet: 30, saveBonus: 2, conditionImmunities: ['frightened'] });
    expect(auraLinesDe(aura)).toEqual(['+2 auf alle Rettungswürfe', 'immun gegen Verängstigt']);
  });

  it('CHA-Mod unter +1 zählt als +1', () => {
    expect(characterAuras([AURA_OF_PROTECTION], { mods: mods({ cha: -1 }), profBonus: 2 })[0].saveBonus).toBe(1);
  });
});

describe('savingThrowDerivations', () => {
  it('Aura und Mantel kommen auf jeden Rettungswurf, Übung nur auf geübte', () => {
    const m = mods({ wis: 1, cha: 2 });
    const auras = characterAuras([AURA_OF_PROTECTION], { mods: m, profBonus: 3 });
    const saves = savingThrowDerivations({
      mods: m, profBonus: 3, saveProfs: { ...noProfs, wis: true },
      sources: savingThrowSources([CLOAK], [AURA_OF_PROTECTION], auras),
    });
    expect(rows(saves.wis)).toEqual([['WEI-Mod', 1], ['Übungsbonus', 3], ['Mantel des Schutzes', 1], ['Aura des Schutzes', 2]]);
    expect(saves.wis.total).toBe(7);
    expect(saves.str.total).toBe(3);
  });

  it('Beschränkung auf Attribute; Vorteil und situative Zuschläge stehen nur als Hinweis', () => {
    const gnome = feature('srd-2024_gnome_gnomish-cunning', 'Gnomische Gerissenheit', {
      savingThrow: [{ kind: 'advantage', abilities: ['int', 'wis', 'cha'] }],
    });
    const dwarf = feature('x_resilience', 'Zwergische Widerstandskraft', {
      savingThrow: [{ kind: 'situational', value: 2, condition: 'against poison', conditionDe: 'gegen Gift', abilities: ['con'] }],
    });
    const saves = savingThrowDerivations({
      mods: mods({}), profBonus: 2, saveProfs: noProfs,
      sources: savingThrowSources([], [gnome, dwarf], []),
    });
    expect(saves.int.notes).toEqual(['Vorteil (Gnomische Gerissenheit)']);
    expect(saves.str.notes).toEqual([]);
    expect(saves.con.notes).toEqual(['Zwergische Widerstandskraft +2: gegen Gift']);
    expect(saves.con.total).toBe(0);
  });

  it('ein Gegenstand, der nicht wirkt, steht als Hinweis', () => {
    const saves = savingThrowDerivations({
      mods: mods({}), profBonus: 2, saveProfs: noProfs, sources: [],
      idle: [{ item: CLOAK.item, reason: 'unattuned' }],
    });
    expect(saves.dex.notes).toEqual(['Mantel des Schutzes: nicht eingestimmt']);
  });
});
