/**
 * Resistenzen und Immunitäten aus `grants.defenses`.
 *
 *   npm run test -- defenses
 */
import { describe, expect, it } from 'vitest';
import { characterDefenses, defenseTextDe, defenseWhenDe, type DefenseFeature } from '../../src/lib/services/defenses';
import { featureGrantSchema } from '../../src/lib/schemas/grants';

const feature = (key: string, name: string, grants: unknown): DefenseFeature =>
  ({ key, name, grants: featureGrantSchema.parse(grants) });

const RAGE = feature('srd-2024_barbarian_rage', 'Kampfrausch', {
  defenses: [{ resistances: ['bludgeoning', 'piercing', 'slashing'], condition: 'while your Rage is active', conditionDe: 'solange dein Kampfrausch aktiv ist' }],
});
const RESILIENCE = feature('srd-2024_dwarf_dwarven-resilience', 'Zwergische Unverwüstlichkeit', {
  defenses: [{ resistances: ['poison'] }],
});
const MINDLESS = feature('srd-2024_path-of-the-berserker_mindless-rage', 'Kopfloser Kampfrausch', {
  defenses: [{ conditionImmunities: ['charmed', 'frightened'], condition: 'while your Rage is active' }],
});

describe('characterDefenses', () => {
  it('sammelt die Beiträge je Merkmal, ein doppelt erreichtes Merkmal zählt einmal', () => {
    const out = characterDefenses([RAGE, RESILIENCE, RAGE]);
    expect(out.map((d) => d.labelDe)).toEqual(['Kampfrausch', 'Zwergische Unverwüstlichkeit']);
  });

  it('liest Schadensarten und Zustände deutsch, die Lage fällt aufs Englische zurück', () => {
    const [rage, resilience, mindless] = characterDefenses([RAGE, RESILIENCE, MINDLESS]);
    expect(defenseTextDe(rage.effect)).toBe('Resistenz gegen Wuchtschaden, Stichschaden, Hiebschaden');
    expect(defenseWhenDe(rage.effect)).toBe('solange dein Kampfrausch aktiv ist');
    expect(defenseWhenDe(resilience.effect)).toBe('');
    expect(defenseTextDe(mindless.effect)).toBe('immun gegen die Zustände Bezaubert, Verängstigt');
    expect(defenseWhenDe(mindless.effect)).toBe('while your Rage is active');
  });
});
