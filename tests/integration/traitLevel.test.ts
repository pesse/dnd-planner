/**
 * Speziesmerkmale mit Charakterstufen-Tor — OHNE LLM, über den ECHTEN Vault. Open5e v2 kennt
 * kein Stufenfeld, ein Re-Import verlöre `gainedAt` still; diese Zusicherungen bemerken das.
 *
 *   npm run test -- traitLevel
 */
import { describe, expect, it } from 'vitest';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import { traitsBetween, traitsUpTo } from '../../src/lib/services/traitLevel';
import { resolveSpeciesTraits } from '../../src/lib/services/characterFeatures';
import { speciesNoteFeatures } from '../../src/lib/services/levelUp/features';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { libraryKey } from '../support/libraryKey';

const DRAGONBORN = 'srd-2024_dragonborn';
const FLIGHT = 'srd-2024_dragonborn_draconic-flight';
const BREATH = 'srd-2024_dragonborn_breath-weapon';

const dragonbornTraits = async () => (await getSpeciesByKey(DRAGONBORN))?.traits ?? [];
const keys = (traits: { key?: string }[]) => traits.map((t) => t.key);

describe('Charakterstufen-Tor an Speziesmerkmalen', () => {
  it('trägt genau Celestische Offenbarung ab Stufe 3, Drachenflug und Große Gestalt ab Stufe 5', async () => {
    const gated: string[] = [];
    for (const info of await getSpeciesList()) {
      const spec = await getSpeciesByKey(libraryKey(info));
      for (const t of spec?.traits ?? []) if (t.gainedAt) gated.push(`${t.key}@${t.gainedAt}`);
    }
    expect(gated.sort()).toEqual(['phb-2024_aasimar_celestial-revelation@3', `${FLIGHT}@5`, 'srd-2024_goliath_large-form@5']);
  });

  it('lässt Drachenflug bis Stufe 4 weg und nimmt ihn ab 5 auf; die Odemwaffe gilt ab 1', async () => {
    const traits = await dragonbornTraits();
    expect(keys(traitsUpTo(traits, 1))).toContain(BREATH);
    expect(keys(traitsUpTo(traits, 4))).not.toContain(FLIGHT);
    expect(keys(traitsUpTo(traits, 5))).toContain(FLIGHT);
  });

  it('bringt beim Aufstieg 4 → 5 genau Drachenflug, 5 → 6 nichts', async () => {
    const traits = await dragonbornTraits();
    expect(keys(traitsBetween(traits, 4, 5))).toEqual([FLIGHT]);
    expect(traitsBetween(traits, 5, 6)).toEqual([]);
  });

  it('gibt Drachenflug eine Notiz-Zeile — er ist weder Bogenwert noch Wahl', async () => {
    const gained = traitsBetween(await dragonbornTraits(), 4, 5);
    expect(speciesNoteFeatures(gained).map((f) => [f.key, f.source, f.gainedAt])).toEqual([[FLIGHT, 'species', 5]]);
  });

  it('zeigt am Charakter nur die Merkmale bis zu seiner Stufe', async () => {
    const species = { sourceKey: DRAGONBORN, name: 'Drachenblütiger' };
    const at = async (level: number) =>
      ((await resolveSpeciesTraits(species, level)) ?? []).flatMap((g) => keys(g.features));
    expect(await at(4)).not.toContain(FLIGHT);
    expect(await at(5)).toContain(FLIGHT);
  });

  it('führt Drachenflug im Stufe-1-Wizard nicht', async () => {
    const prep = await buildFeaturePrep({
      species: { sourceKey: DRAGONBORN, name: 'Drachenblütiger' },
      klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
      background: { sourceKey: 'srd-2024_soldier', name: 'Soldat' },
    });
    expect(keys(prep.speciesFeatures)).toContain(BREATH);
    expect(keys(prep.speciesFeatures)).not.toContain(FLIGHT);
    expect(keys(prep.declared)).not.toContain(FLIGHT);
  });
});
