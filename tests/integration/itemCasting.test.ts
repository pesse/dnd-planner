/**
 * Zauber aus einem Gegenstand: der Stab der Wälder wirkt seine Tabelle aus den eigenen Ladungen.
 *
 *   npm run test -- itemCasting
 */
import { describe, expect, it } from 'vitest';
import type { Character } from '../../src/lib/schemas/characterSchema';
import { loadSpellcasting } from '../../src/lib/services/spellcasting/project';
import { testCharacter } from '../support/testCharacter';

const STAFF = 'srd-2024_staff-of-the-woodlands';

const druid = (staff: Partial<Character['inventory'][number]>): Character => {
  const c = testCharacter('Prüfling Druide');
  return { ...c, inventory: [...c.inventory, { name: 'Stab der Wälder', sourceKey: STAFF, count: '1', weight: '4', ...staff }] };
};

describe('Zauber aus dem Stab der Wälder', () => {
  it('wirkt erst angelegt UND eingestimmt', async () => {
    const { state } = await loadSpellcasting(druid({ equipped: true }));
    expect(state.sources.some((s) => s.source.featureKey === STAFF)).toBe(false);
  });

  it('gewährt die Tabelle je Ladungsstufe, bezahlt aus den eigenen Ladungen', async () => {
    const { state } = await loadSpellcasting(druid({ equipped: true, attuned: true }));
    const staff = state.sources.find((s) => s.source.featureKey === STAFF);

    expect(staff?.source.origin).toBe('item');
    expect(staff?.quotas.map((q) => [q.view.quotaId, q.spells])).toEqual([
      ['charges1', ['srd-2024_animal-friendship', 'srd-2024_speak-with-animals']],
      ['charges2', ['srd-2024_barkskin', 'srd-2024_locate-animals-or-plants', 'srd-2024_pass-without-trace']],
      ['charges3', ['srd-2024_speak-with-plants']],
      ['charges5', ['srd-2024_awaken']],
      ['charges6', ['srd-2024_wall-of-thorns']],
    ]);
    expect(staff?.quotas.find((q) => q.view.quotaId === 'charges5')?.view.cast).toMatchObject([
      { kind: 'resource', resource: { feature: STAFF, pool: 'charges' }, amount: 5, labelDe: '5 Ladungen' },
    ]);
    expect(state.resources.find((p) => p.featureKey === STAFF)).toMatchObject({
      labelDe: 'Stab der Wälder: Ladungen',
      max: [6],
    });
  });

  it('nutzt den Zauber-SG des Druiden', async () => {
    const { state } = await loadSpellcasting(druid({ equipped: true, attuned: true }));
    const staff = state.sources.find((s) => s.source.featureKey === STAFF);
    const druidSource = state.sources.find((s) => s.source.featureKey === 'srd-2024_druid_spellcasting');

    expect(staff?.ability).toBe('Wisdom');
    expect(staff?.saveDC).toBe(druidSource?.saveDC);
    expect(state.issues).toEqual([]);
  });
});
