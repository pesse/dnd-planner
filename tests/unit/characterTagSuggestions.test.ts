import { describe, expect, it } from 'vitest';
import { suggestLanguages, suggestTools, toolSuggestions } from '../../src/lib/services/characterTagSuggestions';
import type { ItemInfo } from '../../src/lib/itemLibrary';

const tool = (index: string, name_de: string) => ({ index, name: index, name_de, path: index }) as ItemInfo;

describe('suggestLanguages', () => {
  it('schlägt auch seltene Sprachen vor', () => {
    expect(suggestLanguages('dieb')).toEqual([{ value: 'Diebessprache', hint: 'Selten' }]);
  });

  it('stellt Präfix-Treffer vor Treffer im Wort', () => {
    const values = suggestLanguages('elf').map((s) => s.value);
    expect(values[0]).toBe('Elfisch');
  });

  it('bietet bei leerer Eingabe die ganze Liste an', () => {
    expect(suggestLanguages('  ').map((s) => s.value)).toContain('Urtümlich');
  });
});

describe('suggestTools', () => {
  const all = toolSuggestions([
    tool('smiths-tools', 'Schmiedewerkzeug'),
    tool('musical-instrument-lute', 'Musikinstrument, Laute'),
    tool('thieves-tools', 'Diebeswerkzeug'),
  ]);

  it('nimmt die Labels der Werkzeug-Wahl und markiert Handwerkszeug', () => {
    expect(all).toEqual([
      { value: 'Diebeswerkzeug', hint: undefined },
      { value: 'Laute (Musikinstrument)', hint: undefined },
      { value: 'Schmiedewerkzeug', hint: 'Handwerkszeug' },
    ]);
  });

  it('findet Instrumente über ihre Familie', () => {
    expect(suggestTools(all, 'musik').map((s) => s.value)).toEqual(['Laute (Musikinstrument)']);
  });
});
