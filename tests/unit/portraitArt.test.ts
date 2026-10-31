import { describe, expect, it } from 'vitest';
import { portraitArtNames } from '../../src/lib/services/portraitArt';
import { aspectCrop } from '../../src/lib/services/imageGen/figureFromPortrait';

const base = {
  species: { sourceKey: 'srd-2024_elf', name: 'Elf' },
  classes: [{ sourceKey: 'srd-2024_ranger', name: 'Waldläufer', level: 3, subclassKey: 'phb-2024_gloom-stalker' }],
  backgroundRef: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
};

describe('portraitArtNames', () => {
  it('nimmt Subklasse, Klasse, Hintergrund und Volk der eigenen Figur, dann die Kombination', () => {
    expect(portraitArtNames({ ...base, presentation: 'feminine' })).toEqual([
      'figures/elf-feminine/subclasses/gloom-stalker',
      'figures/elf-feminine/classes/ranger',
      'figures/elf-feminine/backgrounds/sage',
      'figures/elf-feminine/species',
      'combos/elf-ranger',
    ]);
  });

  it('bietet ohne Äußeres alle drei Figuren an', () => {
    const names = portraitArtNames({ ...base, presentation: '' });
    expect(names.filter((n) => n.endsWith('/species'))).toHaveLength(3);
  });

  it('hat ohne Volk nichts', () => {
    expect(portraitArtNames({ ...base, species: { sourceKey: '', name: '' } })).toEqual([]);
  });
});

describe('aspectCrop', () => {
  it('schneidet ein Hochformat 2:3 oben bündig auf 4:5', () => {
    expect(aspectCrop(640, 960, 4 / 5)).toEqual({ x: 0, y: 0, width: 640, height: 800 });
  });
  it('schneidet ein Querformat mittig', () => {
    expect(aspectCrop(1000, 500, 4 / 5)).toEqual({ x: 300, y: 0, width: 400, height: 500 });
  });
});
