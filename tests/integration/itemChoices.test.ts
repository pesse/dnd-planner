/**
 * Was an der Inventarzeile entschieden wird: die Elementarebene des Rings der
 * Elementarbeherrschung und die beim Fund ausgewürfelten Ladungen.
 *
 *   npm run test -- itemChoices
 */
import { describe, expect, it } from 'vitest';
import type { Character, CharacterInventoryEntry } from '../../src/lib/schemas/characterSchema';
import { buildItemIndex, getAllItemsByDir } from '../../src/lib/itemLibrary';
import { characterDefenses } from '../../src/lib/services/defenses';
import { resolveResources } from '../../src/lib/services/resources/resolve';
import { loadSpellcasting } from '../../src/lib/services/spellcasting/project';
import { wornItemsIn } from '../../src/lib/services/wornItems';
import { testCharacter } from '../support/testCharacter';

const RING = 'srd-2024_ring-of-elemental-command';
const STEALER = 'srd-2024_nine-lives-stealer-longsword';

const withLine = (line: CharacterInventoryEntry): Character => {
  const c = testCharacter('Prüfling Druide');
  return { ...c, inventory: [...c.inventory, line] };
};
const ring = (option?: string): CharacterInventoryEntry =>
  ({ name: 'Ring der Elementarbeherrschung', sourceKey: RING, count: '1', weight: '', equipped: true, attuned: true, option });

describe('Ring der Elementarbeherrschung', () => {
  it('wirkt nur die Zauber der gewählten Ebene', async () => {
    const spellsOf = async (option?: string) => {
      const { state } = await loadSpellcasting(withLine(ring(option)));
      return state.sources.find((s) => s.source.featureKey === RING)?.quotas.flatMap((q) => q.spells) ?? [];
    };
    expect(await spellsOf()).toEqual([]);
    expect(await spellsOf('Fire')).toEqual([
      'srd-2024_burning-hands', 'srd-2024_fireball', 'srd-2024_wall-of-fire', 'srd-2024_fire-storm',
    ]);
  });

  it('gewährt die Abwehr der gewählten Ebene', async () => {
    const index = buildItemIndex(await getAllItemsByDir());
    const defensesOf = (option?: string) => characterDefenses([], 2, wornItemsIn(index, [ring(option)])).map((d) => d.textDe);
    expect(defensesOf()).toEqual([]);
    expect(defensesOf('Fire')).toEqual(['immun gegen Feuerschaden']);
    expect(defensesOf('Air')).toEqual(['Resistenz gegen Blitzschaden']);
  });
});

describe('Ausgewürfelte Ladungen', () => {
  const stealer = (rolled?: Record<string, number>): CharacterInventoryEntry =>
    ({ name: 'Dieb der Neun Leben', sourceKey: STEALER, count: '1', weight: '', equipped: true, attuned: true, rolled });
  const maxOf = async (line: CharacterInventoryEntry) =>
    (await resolveResources(withLine(line))).pools.find((p) => p.featureKey === STEALER)?.max[0];

  it('zählt bis zum Wurf mit dem höchsten Ergebnis, danach mit dem gewürfelten', async () => {
    expect(await maxOf(stealer())).toBe(9);
    expect(await maxOf(stealer({ charges: 4 }))).toBe(4);
  });
});
