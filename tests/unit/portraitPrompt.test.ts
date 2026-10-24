/**
 * Bild-Prompt fürs Charakterportrait.
 *
 *   npm run test -- portraitPrompt
 */
import { describe, expect, it } from 'vitest';
import { buildPortraitSubject, withArtStyle, ART_STYLES } from '../../src/lib/services/imageGen/portraitPrompt';
import { testCharacter } from '../support/testCharacter';

describe('buildPortraitSubject', () => {
  it('nennt Volk, Klasse und Unterklasse mit ihren englischen Bibliotheksnamen', () => {
    const subject = buildPortraitSubject(testCharacter('Prüfling Magier'));
    expect(subject).toContain('gnome wizard (evoker)');
  });

  it('übernimmt Äußeres und gepflegte Aussehensfelder, leere nicht', () => {
    const c = testCharacter('Prüfling Druide');
    c.presentation = 'feminine';
    c.personal.haarfarbe = 'kupferrot';
    c.personal.geschlecht = 'weiblich';
    const subject = buildPortraitSubject(c);
    expect(subject).toContain('feminine dwarf druid');
    expect(subject).toContain('Hair: kupferrot.');
    expect(subject).not.toContain('Eyes:');
    expect(subject).not.toContain('Gender:');
  });

  it('fällt ohne Klassen-Link auf „adventurer" zurück', () => {
    expect(buildPortraitSubject(testCharacter('Prüfling Altform'))).toContain('Subject: adventurer.');
  });
});

describe('withArtStyle', () => {
  it('hängt den Stil an und lässt das Motiv bei „kein Stil" unverändert', () => {
    const series = ART_STYLES.find((s) => s.id === 'series')!;
    expect(withArtStyle('A dwarf.', 'series')).toBe(`A dwarf. ${series.prompt}`);
    expect(withArtStyle(' A dwarf. ', 'none')).toBe('A dwarf.');
  });
});
