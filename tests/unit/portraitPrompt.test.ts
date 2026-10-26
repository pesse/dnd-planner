/**
 * Bild-Prompt fürs Charakterportrait.
 *
 *   npm run test -- portraitPrompt
 */
import { describe, expect, it } from 'vitest';
import { buildPortraitSubject, currentEnglish, figureTraits, portraitTexts, restyle, withArtStyle, ART_STYLES, PORTRAIT_FIELDS } from '../../src/lib/services/imageGen/portraitPrompt';
import { testCharacter } from '../support/testCharacter';

describe('buildPortraitSubject', () => {
  it('nennt Volk und Klasse mit ihren englischen Bibliotheksnamen, die Unterklasse nicht', () => {
    const subject = buildPortraitSubject(testCharacter('Prüfling Magier'));
    expect(subject).toContain('gnome wizard,');
    expect(subject).not.toContain('evoker');
  });

  it('übernimmt Äußeres und gepflegte Aussehensfelder, leere nicht', () => {
    const c = testCharacter('Prüfling Druide');
    c.presentation = 'feminine';
    c.personal.haarfarbe = 'kupferrot';
    const subject = buildPortraitSubject(c);
    expect(subject).toContain('female dwarf druid');
    expect(subject).toContain('Hair: kupferrot.');
    expect(subject).not.toContain('Eyes:');
  });

  it('beschreibt das Volk über den Namen hinaus, ein unbekanntes nicht', () => {
    const c = testCharacter('Prüfling Druide');
    expect(buildPortraitSubject(c)).toContain('Dwarf: short, stout and broad-shouldered');
    c.species = { sourceKey: 'homebrew-sam_moosling', name: 'Moosling' };
    expect(buildPortraitSubject(c)).not.toMatch(/Dwarf:|undefined/);
  });

  it('nennt das Äußere als male/female/androgynous statt mit den internen Werten', () => {
    const c = testCharacter('Prüfling Druide');
    c.presentation = 'masculine';
    expect(buildPortraitSubject(c)).toContain('portrait: male dwarf druid,');
    c.presentation = 'androgynous';
    expect(buildPortraitSubject(c)).toContain('portrait: androgynous dwarf druid,');
  });

  it('fällt ohne Klassen-Link auf „adventurer" zurück', () => {
    expect(buildPortraitSubject(testCharacter('Prüfling Altform'))).toContain('portrait: adventurer,');
  });

  it('hängt den Freitext aus dem Dialog vor dem Schluss an', () => {
    const subject = buildPortraitSubject(testCharacter('Prüfling Magier'), ' Narbe über dem Auge ');
    expect(subject).toMatch(/Also: Narbe über dem Auge\. No text\.$/);
  });
});

describe('figureTraits', () => {
  it('nimmt Haut, Haar, Augen und Aussehen, aber weder Alter noch Größe', () => {
    const c = testCharacter('Prüfling Druide');
    c.personal.alter = '92';
    c.personal.koerpergroesse = '1,30 m';
    c.personal.haarfarbe = 'blond';
    expect(figureTraits(c, { hair: 'blond, braided' })).toBe('Hair: blond, braided.');
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

describe('restyle', () => {
  const ink = ART_STYLES.find((s) => s.id === 'ink')!;

  it('tauscht den Stilblock im von Hand geänderten Prompt und lässt den Rest stehen', () => {
    const edited = `${withArtStyle('A bearded dwarf.', 'series')} Extra.`;
    expect(restyle(edited, 'series', 'ink')).toBe(`A bearded dwarf. ${ink.prompt} Extra.`);
  });

  it('hängt den Stil an, wenn der alte Block weggeschnitten wurde', () => {
    expect(restyle('A dwarf.', 'series', 'ink')).toBe(`A dwarf. ${ink.prompt}`);
  });
});
