import { describe, expect, it } from 'vitest';
import { entryArtCandidates, presentEntryArt } from '../../src/lib/services/libraryEntryArt';

const species = [{ key: 'srd-2024_dwarf', name: 'Zwerg' }, { key: 'phb-2024_orc', name: 'Ork' }];
const names = (groups: ReturnType<typeof entryArtCandidates>) =>
  groups.map((g) => [g.title, g.candidates.map((c) => c.name)]);

describe('Bilder-Reiter der Bibliothekseinträge', () => {
  it('zeigt beim Volk nur dessen drei Grundfiguren', () => {
    expect(names(entryArtCandidates('species', 'srd-2024_dwarf', species))).toEqual([
      ['', ['figures/dwarf-feminine/species', 'figures/dwarf-androgynous/species', 'figures/dwarf-masculine/species']],
    ]);
  });

  it('sammelt bei der Klasse Grundbild und Figuren je Volk', () => {
    const groups = entryArtCandidates('class', 'srd-2024_fighter', species);
    expect(groups[0]).toEqual({ title: 'Allgemein', candidates: [{ name: 'classes/fighter', label: 'Ohne Volk' }] });
    expect(names(groups)[2]).toEqual(['Ork', [
      'figures/orc-feminine/classes/fighter', 'figures/orc-androgynous/classes/fighter',
      'figures/orc-masculine/classes/fighter',
    ]]);
  });

  it('hat für Unterklassen nur Figuren, für Hintergründe zusätzlich das Grundbild', () => {
    expect(names(entryArtCandidates('subclass', 'srd-2024_champion', species)).map(([t]) => t)).toEqual(['Zwerg', 'Ork']);
    const bg = entryArtCandidates('background', 'srd-2024_sage', species);
    expect(bg[0].candidates[0].name).toBe('backgrounds/sage');
  });

  it('zeigt beim Monster Szene und Symbol, eigene Monster unter ihrem Namens-Slug', () => {
    expect(names(entryArtCandidates('monster', 'srd-2024_owlbear', species))).toEqual([['', ['monster-scenes/owlbear', 'monsters/owlbear']]]);
    expect(names(entryArtCandidates('monster', 'goblin-kaempfer', species))).toEqual([['', ['monster-scenes/goblin-kaempfer', 'monsters/goblin-kaempfer']]]);
  });

  it('reiht weitere Szenen aus dem Ordner des Monsters nach der ersten ein, numerisch sortiert', () => {
    const art = new Set(['monster-scenes/owlbear/10', 'monster-scenes/owlbear/2', 'monster-scenes/owlbear', 'monster-scenes/owlbear-cub']);
    expect(names(entryArtCandidates('monster', 'srd-2024_owlbear', species, art))).toEqual([['', [
      'monster-scenes/owlbear', 'monster-scenes/owlbear/2', 'monster-scenes/owlbear/10', 'monsters/owlbear',
    ]]]);
  });

  it('zeigt neben der Monsterkarte nur vorhandene Szenen, kein Symbol', () => {
    const art = new Set(['monster-scenes/owlbear/2', 'monsters/owlbear']);
    expect(presentEntryArt('monster', 'owlbear', [], art)).toEqual(['/art/monster-scenes/owlbear/2.avif']);
  });
});
