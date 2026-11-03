import { describe, expect, it } from 'vitest';
import { spellsByLevel } from '../../src/lib/services/spellcasting/byLevel';
import type { SpellInfo } from '../../src/lib/spellLibrary';

const info = (name: string, level: number): SpellInfo => ({ name, level, classes: [], school: '', path: '' });
const lib: Record<string, SpellInfo> = {
  'srd-2024_bless': info('Segnen', 1),
  'srd-2024_sacred-flame': info('Heilige Flamme', 0),
  'srd-2024_aid': info('Beistand', 2),
};

describe('Zauber nach Grad am Spieltisch', () => {
  it('ordnet nach Grad und Name und nennt einen Zauber aus mehreren Quellen einmal', () => {
    const groups = spellsByLevel(
      [
        { key: 'srd-2024_bless', label: 'Segnen', level: 1 },
        { key: 'srd-2024_aid', label: 'Beistand', level: 2 },
        { key: 'srd-2024_sacred-flame', label: 'Heilige Flamme', level: 0 },
        { key: 'srd-2024_bless', label: 'Segnen', level: 1 },
        { key: '', label: 'Befehl', level: 1 },
      ],
      (key) => lib[key],
    );
    expect(groups.map((g) => [g.level, g.spells.map((s) => s.label)])).toEqual([
      [0, ['Heilige Flamme']],
      [1, ['Befehl', 'Segnen']],
      [2, ['Beistand']],
    ]);
  });
});
