/**
 * Bausteine des Einsteiger-Wizards ohne Vault: Standardsatz, ASI-Vorschlag, Persönliches.
 *
 *   npm run test -- wizardOrigin
 */
import { describe, expect, it } from 'vitest';
import { isStandardArray, isComplete, pointBuyStart, type AbilityScores } from '../../src/lib/services/wizard/pointBuy';
import { suggestAsi, isValidAllocation } from '../../src/lib/services/wizard/backgroundAsi';
import { applyPersonal, COMMON_LANGUAGE } from '../../src/lib/services/wizard/personal';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { isMirroredArt, originArtCandidates } from '../../src/lib/services/wizard/originArt';

const FIGHTER: AbilityScores = { str: 15, dex: 14, con: 13, int: 8, wis: 10, cha: 12 };

describe('Standardsatz', () => {
  it('erkennt jede Permutation und lehnt Teilstände ab', () => {
    expect(isStandardArray(FIGHTER)).toBe(true);
    expect(isStandardArray({ ...FIGHTER, int: 10 })).toBe(false);
    expect(isStandardArray(pointBuyStart())).toBe(false);
  });

  it('kostet genau das Punktekauf-Budget', () => {
    expect(isComplete(FIGHTER)).toBe(true);
  });
});

describe('Vorschlag für den Hintergrund-Bonus', () => {
  it('legt +2 auf das Hauptattribut und +1 auf den nächsthöchsten Wert', () => {
    const asi = suggestAsi(['str', 'dex', 'con'], ['str'], FIGHTER);
    expect(asi).toEqual({ str: 2, dex: 1 });
    expect(isValidAllocation(asi, ['str', 'dex', 'con'])).toBe(true);
  });

  it('verteilt ohne erlaubtes Hauptattribut +1/+1/+1', () => {
    const asi = suggestAsi(['int', 'wis', 'cha'], ['str'], FIGHTER);
    expect(asi).toEqual({ int: 1, wis: 1, cha: 1 });
    expect(isValidAllocation(asi, ['int', 'wis', 'cha'])).toBe(true);
  });
});

describe('Persönliches', () => {
  it('setzt Gemeinsprache vorn, Spielername und Bogentexte', () => {
    const c = characterSchema.parse({ name: 'Prüfling' });
    applyPersonal(c, {
      playerName: ' Sam ', languages: ['Elfisch', COMMON_LANGUAGE, 'Zwergisch'], alignment: 'Neutral gut',
      appearance: ' groß ', traits: 'neugierig', ideals: '', bonds: '', flaws: 'ungeduldig',
    });
    expect(c.playerName).toBe('Sam');
    expect(c.languages).toEqual([COMMON_LANGUAGE, 'Elfisch', 'Zwergisch']);
    expect(c.personal.gesinnung).toBe('Neutral gut');
    expect(c.personal.aussehen).toBe('groß');
    expect([c.traits, c.flaws]).toEqual(['neugierig', 'ungeduldig']);
  });
});

describe('Stimmungsbild der Herkunfts-Schritte', () => {
  const keys = { classKey: 'srd-2024_wizard', speciesKey: 'srd-2024_dwarf', backgroundKey: 'srd-2024_sage' };

  it('nimmt die Kombination vor dem Bild des Schritts', () => {
    expect(originArtCandidates('class', keys)).toEqual([
      '/art/combos/dwarf-wizard.avif', '/art/classes/wizard.avif', '/art/species/dwarf.avif',
    ]);
    expect(originArtCandidates('species', keys)[0]).toBe('/art/species/dwarf.avif');
  });

  it('nimmt mit Äußerem zuerst die Figur', () => {
    const fig = { ...keys, presentation: 'feminine' as const };
    expect(originArtCandidates('species', fig)[0]).toBe('/art/figures/dwarf-feminine/species.avif');
    expect(originArtCandidates('background', fig).slice(0, 2)).toEqual([
      '/art/figures/dwarf-feminine/backgrounds/sage.avif', '/art/backgrounds/sage.avif',
    ]);
    expect(originArtCandidates('class', fig).slice(0, 2)).toEqual([
      '/art/figures/dwarf-feminine/classes/wizard.avif', '/art/combos/dwarf-wizard.avif',
    ]);
  });

  it('zeigt im Hintergrund-Schritt zuerst den Hintergrund', () => {
    expect(originArtCandidates('background', keys)[0]).toBe('/art/backgrounds/sage.avif');
  });

  it('fragt ohne Volk keine Kombination an', () => {
    expect(originArtCandidates('class', { ...keys, speciesKey: '' })).toEqual(['/art/classes/wizard.avif']);
  });

  it('spiegelt nur die nach links blickenden Bilder', () => {
    const hermit = originArtCandidates('background', { ...keys, backgroundKey: 'srd-2024_hermit' })[0];
    expect(isMirroredArt(hermit)).toBe(true);
    expect(isMirroredArt(originArtCandidates('background', keys)[0])).toBe(false);
  });
});
