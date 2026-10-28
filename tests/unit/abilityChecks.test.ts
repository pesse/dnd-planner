/**
 * Deklarierte Zuschläge und Vorteil auf Fertigkeitswürfe.
 *
 *   npm run test -- abilityChecks
 */
import { describe, expect, it } from 'vitest';
import { checkSources, skillCheckEffects } from '../../src/lib/services/abilityChecks';
import { featureGrantSchema } from '../../src/lib/schemas/grants';
import { SKILL_DEFS } from '../../src/lib/domain/skills';

const def = (en: string) => SKILL_DEFS.find((d) => d.en === en)!;
const feature = (name: string, checks: unknown[]) => ({ name, grants: featureGrantSchema.parse({ checks }) });
const ctx = { mods: { str: 0, dex: 0, con: 0, int: 0, wis: 2, cha: 0 }, profBonus: 3 };

describe('skillCheckEffects', () => {
  const sources = checkSources([
    feature('Außerweltlicher Glanz', [{ kind: 'bonus', value: { abilityMod: 'Wisdom', min: 1 }, abilities: ['cha'] }]),
    feature('Bemerkenswerter Athlet', [{ kind: 'advantage', skills: ['Athletics'] }]),
    feature('Kampfrausch', [{ kind: 'advantage', abilities: ['str'], conditionDe: 'solange dein Kampfrausch aktiv ist' }]),
  ]);

  it('trifft über das Attribut alle seine Fertigkeiten', () => {
    expect(skillCheckEffects(def('Persuasion'), sources, ctx).rows).toEqual([{ labelDe: 'Außerweltlicher Glanz', value: 2 }]);
    expect(skillCheckEffects(def('Insight'), sources, ctx).rows).toEqual([]);
  });

  it('markiert nur Vorteil ohne Bedingung, nennt aber beide', () => {
    const fx = skillCheckEffects(def('Athletics'), sources, ctx);
    expect(fx.advantage).toBe(true);
    expect(fx.notes).toEqual(['Vorteil (Bemerkenswerter Athlet)', 'Vorteil (Kampfrausch): solange dein Kampfrausch aktiv ist']);
  });

  it('zählt ein doppelt geführtes Merkmal einmal', () => {
    const glamour = feature('Außerweltlicher Glanz', [{ kind: 'bonus', value: 1, abilities: ['cha'] }]);
    expect(skillCheckEffects(def('Deception'), checkSources([glamour, glamour]), ctx).rows).toHaveLength(1);
  });
});
