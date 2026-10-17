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

  it('fragt ohne Äußeres keinen Subklassen-Ordner an', () => {
    expect(subclassArtCandidates('phb-2024_battle-master', keys).some((u) => u.includes('/subclasses/'))).toBe(false);
  });
});
