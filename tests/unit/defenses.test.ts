/**
 * Resistenzen und Immunitäten aus `grants.defenses`.
 *
 *   npm run test -- defenses
 */
import { describe, expect, it } from 'vitest';
import { characterDefenses, defenseWhenDe, type DefenseFeature } from '../../src/lib/services/defenses';
import { featureGrantSchema } from '../../src/lib/schemas/grants';

const feature = (key: string, name: string, grants: unknown): DefenseFeature =>
  ({ key, name, grants: featureGrantSchema.parse(grants) });

const RAGE = feature('srd-2024_barbarian_rage', 'Kampfrausch', {
  defenses: [{ resistances: ['bludgeoning', 'piercing', 'slashing'], condition: 'while your Rage is active', conditionDe: 'solange dein Kampfrausch aktiv ist' }],
});
const RESILIENCE = feature('srd-2024_dwarf_dwarven-resilience', 'Zwergische Unverwüstlichkeit', {
  defenses: [{ resistances: ['poison'] }],
});
const HEAVY_ARMOR = feature('phb-2024_heavy-armor-master', 'Meister der schweren Rüstung', {
  defenses: [{ reduction: { types: ['bludgeoning', 'piercing', 'slashing'], amount: 'proficiency-bonus' } }],
});
const MINDLESS = feature('srd-2024_path-of-the-berserker_mindless-rage', 'Kopfloser Kampfrausch', {
  defenses: [{ conditionImmunities: ['charmed', 'frightened'], condition: 'while your Rage is active' }],
});

describe('characterDefenses', () => {
  it('sammelt die Beiträge je Merkmal, ein doppelt erreichtes Merkmal zählt einmal', () => {
    const out = characterDefenses([RAGE, RESILIENCE, RAGE], 2);
    expect(out.map((d) => d.labelDe)).toEqual(['Kampfrausch', 'Zwergische Unverwüstlichkeit']);
  });

  it('liest Schadensarten und Zustände deutsch, die Lage fällt aufs Englische zurück', () => {
    const [rage, resilience, mindless] = characterDefenses([RAGE, RESILIENCE, MINDLESS], 2);
    expect(rage.textDe).toBe('Resistenz gegen Wuchtschaden, Stichschaden, Hiebschaden');
    expect(defenseWhenDe(rage.effect)).toBe('solange dein Kampfrausch aktiv ist');
    expect(defenseWhenDe(resilience.effect)).toBe('');
    expect(mindless.textDe).toBe('immun gegen die Zustände Bezaubert, Verängstigt');
    expect(defenseWhenDe(mindless.effect)).toBe('while your Rage is active');
  });

  it('rechnet eine Schadensverringerung mit dem Übungsbonus', () => {
    expect(characterDefenses([HEAVY_ARMOR], 3)[0].textDe)
      .toBe('Wuchtschaden, Stichschaden, Hiebschaden um 3 verringert');
  });

  it('führt die festen Resistenzen eines wirkenden Gegenstands mit seiner Lage', () => {
    const item = {
      name: 'Frost Brand (Glaive)', name_de: 'Frostbrand (Glefe)', category: 'weapon', rarity: 'Very Rare', path: '', magic: true,
      defenses: [{ resistances: ['fire' as const], immunities: [], conditionImmunities: [], conditionDe: 'solange du die Waffe hältst' }],
    };
    const [frost] = characterDefenses([], 2, [{ id: 'frost', item }]);
    expect([frost.labelDe, frost.textDe, defenseWhenDe(frost.effect)])
      .toEqual(['Frostbrand (Glefe)', 'Resistenz gegen Feuerschaden', 'solange du die Waffe hältst']);
  });

  it('hängt Einträge von Hand an, ein leerer Eintrag erscheint nicht', () => {
    const out = characterDefenses([RESILIENCE], 2, [], [
      { labelDe: 'Trank', resistances: ['fire'], immunities: [], conditionImmunities: ['poisoned'] },
      { labelDe: '', resistances: ['cold'], immunities: [], conditionImmunities: [] },
      { labelDe: 'nur Titel', resistances: [], immunities: [], conditionImmunities: [] },
    ]);
    expect(out.map((d) => [d.labelDe, d.textDe])).toEqual([
      ['Zwergische Unverwüstlichkeit', expect.any(String)],
      ['Trank', 'Resistenz gegen Feuerschaden; immun gegen den Zustand Vergiftet'],
      ['eigener Eintrag', 'Resistenz gegen Kälteschaden'],
    ]);
  });
});
