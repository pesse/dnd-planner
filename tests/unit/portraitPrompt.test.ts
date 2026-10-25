/**
 * Bild-Prompt fürs Charakterportrait.
 *
 *   npm run test -- portraitPrompt
 */
import { describe, expect, it } from 'vitest';
import { buildPortraitSubject, currentEnglish, portraitTexts, withArtStyle, ART_STYLES, PORTRAIT_FIELDS } from '../../src/lib/services/imageGen/portraitPrompt';
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
    const subject = buildPortraitSubject(c);
    expect(subject).toContain('feminine dwarf druid');
    expect(subject).toContain('Hair: kupferrot.');
    expect(subject).not.toContain('Eyes:');
  });

  it('fällt ohne Klassen-Link auf „adventurer" zurück', () => {
    expect(buildPortraitSubject(testCharacter('Prüfling Altform'))).toContain('portrait: adventurer,');
  });

  it('hängt den Freitext aus dem Dialog vor dem Schluss an', () => {
    const subject = buildPortraitSubject(testCharacter('Prüfling Magier'), ' Narbe über dem Auge ');
    expect(subject).toMatch(/Also: Narbe über dem Auge\. No text\.$/);
  });
});

describe('Übersetzung', () => {
  const en = { age: '', height: '', skin: 'fair', hair: 'copper red', eyes: '', appearance: '', extra: 'hooded cloak' };

  it('ersetzt übersetzte Felder im Prompt, unübersetzte bleiben deutsch', () => {
    const c = testCharacter('Prüfling Druide');
    c.personal.hautfarbe = 'hell';
    c.personal.haarfarbe = 'kupferrot';
    c.personal.augenfarbe = 'braun';
    const texts = portraitTexts(c, 'Kapuzenmantel');
    const subject = buildPortraitSubject(c, 'Kapuzenmantel', currentEnglish(texts, { source: texts, en }));
    expect(subject).toContain('Skin: fair. Hair: copper red. Eyes: braun.');
    expect(subject).toContain('Also: hooded cloak.');
  });

  it('verwirft die Übersetzung eines Feldes, sobald sich sein deutscher Text ändert', () => {
    const source = { skin: 'hell', hair: 'kupferrot' };
    expect(currentEnglish({ skin: 'hell', hair: 'schwarz' }, { source, en })).toEqual({ skin: 'fair' });
  });
});

describe('Länge des Standard-Prompts', () => {
  // Cloudflare lehnt über 2048 Zeichen ab; die Vorlage soll dem Freitext den Großteil lassen.
  it('bleibt mit jedem Stil und allen Feldern kurz gepflegt weit unter 2000 Zeichen', () => {
    const c = testCharacter('Prüfling Multiklasse');
    c.presentation = 'androgynous';
    for (const f of PORTRAIT_FIELDS) c.personal[f.key] = 'mittelbraun';
    for (const style of ART_STYLES) {
      expect(withArtStyle(buildPortraitSubject(c), style.id).length).toBeLessThan(700);
    }
  });
});

describe('withArtStyle', () => {
  it('hängt den Stil an und lässt das Motiv bei „kein Stil" unverändert', () => {
    const series = ART_STYLES.find((s) => s.id === 'series')!;
    expect(withArtStyle('A dwarf.', 'series')).toBe(`A dwarf. ${series.prompt}`);
    expect(withArtStyle(' A dwarf. ', 'none')).toBe('A dwarf.');
  });
});
