/**
 * `withCurrentSorted`: deutsche Kollation statt Quell-Reihenfolge, ohne die
 * Altdaten-voranstellen-Invariante von `withCurrent` zu verlieren.
 */
import { describe, expect, it } from 'vitest';
import { withCurrentSorted } from '../../src/lib/services/characterFormFields';
import { CLASS_NAMES_DE } from '../../src/lib/services/classProgression';

describe('withCurrentSorted', () => {
  it('sortiert deutsch kollationiert statt nach Quell-Reihenfolge', () => {
    const sorted = withCurrentSorted(CLASS_NAMES_DE, '');
    expect(sorted).toEqual([
      'Barbar', 'Barde', 'Druide', 'Hexenmeister', 'Kämpfer', 'Kleriker',
      'Magier', 'Mönch', 'Paladin', 'Schurke', 'Waldläufer', 'Zauberer',
    ]);
    // Kämpfer/Mönch stehen NICHT hinter Zauberer — genau der Fehler, den 'de' verhindert.
    expect(CLASS_NAMES_DE).toEqual([
      'Barbar', 'Barde', 'Kleriker', 'Druide', 'Kämpfer', 'Mönch', 'Paladin',
      'Waldläufer', 'Schurke', 'Zauberer', 'Hexenmeister', 'Magier',
    ]);
  });

  it('stellt einen Altdaten-Wert außerhalb der Liste voran', () => {
    const sorted = withCurrentSorted(CLASS_NAMES_DE, 'Hexer');
    expect(sorted[0]).toBe('Hexer');
  });
});
