import { describe, expect, it } from 'vitest';
import { entryArtCandidates } from '../../src/lib/services/libraryEntryArt';

const species = [{ key: 'srd-2024_dwarf', name: 'Zwerg' }, { key: 'phb-2024_orc', name: 'Ork' }];
const names = (groups: ReturnType<typeof entryArtCandidates>) =>
  groups.map((g) => [g.title, g.candidates.map((c) => c.name)]);

describe('Bilder-Reiter der Bibliothekseinträge', () => {
  it('zeigt beim Volk nur dessen drei Grundfiguren', () => {
    expect(names(entryArtCandidates('species', 'srd-2024_dwarf', species))).toEqual([
      ['', ['figures/dwarf-feminine/species', 'figures/dwarf-androgynous/species', 'figures/dwarf-masculine/species']],
    ]);
  });

  it('sammelt bei der Klasse Grundbild, Figuren und Szene je Volk', () => {
    const groups = entryArtCandidates('class', 'srd-2024_fighter', species);
    expect(groups[0]).toEqual({ title: 'Allgemein', candidates: [{ name: 'classes/fighter', label: 'Ohne Volk' }] });
    expect(names(groups)[2]).toEqual(['Ork', [
      'figures/orc-feminine/classes/fighter', 'figures/orc-androgynous/classes/fighter',
      'figures/orc-masculine/classes/fighter', 'combos/orc-fighter',
    ]]);
  });

  it('hat für Unterklassen nur Figuren, für Hintergründe zusätzlich das Grundbild', () => {
    expect(names(entryArtCandidates('subclass', 'srd-2024_champion', species)).map(([t]) => t)).toEqual(['Zwerg', 'Ork']);
    const bg = entryArtCandidates('background', 'srd-2024_sage', species);
    expect(bg[0].candidates[0].name).toBe('backgrounds/sage');
    expect(bg[1].candidates.map((c) => c.name)).not.toContain('combos/dwarf-sage');
  });
});
