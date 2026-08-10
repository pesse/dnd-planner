/**
 * Der abgeleitete Zauber-Zustand gegen die zwei durchgerechneten Fälle aus
 * `docs/plan/zauberquellen-beispiele.json`.
 *
 *   npm run test -- castingState
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { characterSpellcastingSchema, type CharacterSpellcasting } from '../../src/lib/schemas/spellcasting';
import { sharedSlots } from '../../src/lib/services/resources/project';
import { resolveResources } from '../../src/lib/services/resources/resolve';
import { resolveCasting, type CastingCharacter } from '../../src/lib/services/spellcasting/resolve';
import { openPicks, spellcastingState, type SourceState, type SpellcastingState } from '../../src/lib/services/spellcasting/state';
import { getSpellLibrary, resolveSpell } from '../../src/lib/spellLibrary';

interface ExampleFile {
  exampleCharacters: { spellcasting: unknown }[];
}

const stored = (index: number): CharacterSpellcasting => {
  const file = JSON.parse(readFileSync('docs/plan/zauberquellen-beispiele.json', 'utf-8')) as ExampleFile;
  return characterSpellcastingSchema.parse(file.exampleCharacters[index].spellcasting);
};

const NO_MODS = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 3 } as const;

async function state(c: CastingCharacter, index: number): Promise<SpellcastingState> {
  const lib = await getSpellLibrary();
  return spellcastingState({
    resolution: await resolveCasting(c),
    stored: stored(index),
    profBonus: 3,
    mods: { ...NO_MODS },
    resources: await resolveResources(c),
    spellKey: (name) => resolveSpell(lib, name)?.key,
  });
}

const slotsOf = (s: SpellcastingState, shared: string): number[] =>
  sharedSlots(s.resources, shared);

const sourceOf = (s: SpellcastingState, id: string): SourceState => {
  const hit = s.sources.find((x) => x.source.id === id);
  if (!hit) throw new Error(`Quelle ${id} fehlt (${s.sources.map((x) => x.source.id).join(', ')})`);
  return hit;
};

const quotaOf = (s: SourceState, quotaId: string): SourceState['quotas'][number] => {
  const hit = s.quotas.find((q) => q.view.quotaId === quotaId);
  if (!hit) throw new Error(`Quota ${quotaId} fehlt (${s.quotas.map((q) => q.view.quotaId).join(', ')})`);
  return hit;
};

describe('Fee-Zauberer, Charakterstufe 5', () => {
  const character: CastingCharacter = {
    classes: [{ sourceKey: 'srd-2024_sorcerer', name: 'Zauberer', level: 5 }],
    species: { sourceKey: 'phb-2024_fairy', name: 'Fee' },
    // Die Attributwahl der Fee ist eine Antwort am Merkmal, keine Kopie im Zauber-Block.
    features: [
      { sourceKey: 'phb-2024_fairy_fairy-magic', name: 'Feenmagie', choice: 'Charisma', choiceDe: 'Charisma', choiceId: '', desc: '' },
    ],
  };

  it('deckt die gespeicherten Wahlen genau ab', async () => {
    const s = await state(character, 0);
    expect(s.issues).toEqual([]);
    expect(openPicks(s)).toEqual([]);

    const sorcerer = sourceOf(s, 'srd-2024_sorcerer_spellcasting');
    expect(quotaOf(sorcerer, 'cantrips').spells).toHaveLength(5);
    expect(quotaOf(sorcerer, 'prepared').spells).toHaveLength(9);
    expect(sorcerer.ability).toBe('Charisma');
  });

  it('teilt einen Platz-Pool zwischen Klasse und Spezies', async () => {
    const s = await state(character, 0);
    expect(slotsOf(s, 'standard').slice(0, 4)).toEqual([4, 3, 2, 0]);
    expect(slotsOf(s, 'pact')).toEqual(Array(9).fill(0));
  });

  it('speichert von der Fee nur die Attributwahl', async () => {
    const s = await state(character, 0);
    const fairy = sourceOf(s, 'phb-2024_fairy_fairy-magic');
    expect(fairy.ability).toBe('Charisma');
    expect(fairy.abilityOptions).toEqual([]);
    expect(fairy.quotas.map((q) => q.spells)).toEqual([
      ['srd-2024_druidcraft'],
      ['srd-2024_faerie-fire'],
      ['srd-2024_enlargereduce'],
    ]);
    expect(quotaOf(fairy, 'fairy3').uses).toBe(1);
    expect(quotaOf(fairy, 'fairy5').uses).toBe(1);
    expect(quotaOf(fairy, 'fairyCantrip').uses).toBeNull();
  });
});

describe('Barde (Kolleg des Wissens), Klassenstufe 10', () => {
  const character: CastingCharacter = {
    classes: [{ sourceKey: 'srd-2024_bard', name: 'Barde', level: 10, subclassKey: 'srd-2024_college-of-lore' }],
  };

  it('reproduziert Kontingente, Plätze und Zusatzzauber', async () => {
    const s = await state(character, 1);
    expect(s.issues).toEqual([]);
    expect(openPicks(s)).toEqual([]);
    expect(slotsOf(s, 'standard').slice(0, 6)).toEqual([4, 3, 3, 3, 2, 0]);

    const bard = sourceOf(s, 'srd-2024_bard_spellcasting');
    expect(quotaOf(bard, 'cantrips').spells).toHaveLength(4);
    expect(quotaOf(bard, 'prepared').spells).toHaveLength(15);

    const lore = sourceOf(s, 'srd-2024_college-of-lore_magical-discoveries');
    expect(quotaOf(lore, 'discoveries').spells).toEqual(['srd-2024_counterspell', 'srd-2024_spirit-guardians']);
  });

  it('hält Wall of Force im Barden-Kontingent, nicht daneben', async () => {
    const s = await state(character, 1);
    const prepared = quotaOf(sourceOf(s, 'srd-2024_bard_spellcasting'), 'prepared');
    expect(prepared.spells).toContain('srd-2024_wall-of-force');
    expect(prepared.view.pool.lists).toEqual(['bard', 'cleric', 'druid', 'wizard']);
    expect(prepared.open).toBe(0);
  });
});
