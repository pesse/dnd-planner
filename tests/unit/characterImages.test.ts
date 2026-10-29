import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { conceptArtSlots } from '../../src/lib/services/characterImages';

const zwergin = characterSchema.parse({
  name: 'Testfigur',
  presentation: 'feminine',
  species: { sourceKey: 'srd-2024_dwarf', name: 'Zwerg' },
  backgroundRef: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
  classes: [{ name: 'Kämpfer', level: 3, sourceKey: 'srd-2024_fighter', subclassKey: 'srd-2024_champion', subclassName: 'Champion' }],
});

describe('Stimmungsbilder im Bilder-Reiter', () => {
  it('hat je einen Platz für Volk, Hintergrund, Klasse und Unterklasse, die Figur zuerst', () => {
    expect(conceptArtSlots(zwergin).map((s) => [s.label, s.names[0]])).toEqual([
      ['Volk: Zwerg', 'figures/dwarf-feminine/species'],
      ['Hintergrund: Weiser', 'figures/dwarf-feminine/backgrounds/sage'],
      ['Klasse: Kämpfer', 'figures/dwarf-feminine/classes/fighter'],
      ['Unterklasse: Champion', 'figures/dwarf-feminine/subclasses/champion'],
    ]);
  });

  it('fällt in keinem Platz auf das Bild eines anderen zurück', () => {
    const [species, background, , subclass] = conceptArtSlots(zwergin);
    expect(species.names.every((n) => n.includes('dwarf'))).toBe(true);
    expect(background.names).toEqual(['figures/dwarf-feminine/backgrounds/sage', 'backgrounds/sage']);
    expect(subclass.names).toEqual(['figures/dwarf-feminine/subclasses/champion']);
  });
});
