import { describe, expect, it } from 'vitest';
import { subclassArtCandidates } from '../../src/lib/services/levelUp/subclassArt';

describe('Stimmungsbild der Unterklasse', () => {
  const keys = { classKey: 'srd-2024_fighter', speciesKey: 'srd-2024_orc' };

  it('nimmt zuerst das Subklassenbild der Figur, dann das Klassenbild', () => {
    expect(subclassArtCandidates('phb-2024_battle-master', { ...keys, presentation: 'androgynous' }).slice(0, 2)).toEqual([
      '/art/figures/orc-androgynous/subclasses/battle-master.avif',
      '/art/figures/orc-androgynous/classes/fighter.avif',
    ]);
  });

  it('probiert ohne Äußeres die Figuren des Volks der Reihe nach', () => {
    expect(subclassArtCandidates('phb-2024_battle-master', keys).slice(0, 3)).toEqual([
      '/art/figures/orc-androgynous/subclasses/battle-master.avif',
      '/art/figures/orc-masculine/subclasses/battle-master.avif',
      '/art/figures/orc-feminine/subclasses/battle-master.avif',
    ]);
  });
});
