/**
 * Zauber-Index: Key-Ableitung für Dateien ohne `key`, doppelte Keys fallen weg.
 *
 *   npm run test -- spellLibraryIndex
 */
import { describe, expect, it } from 'vitest';
import { dedupeSpellsByKey, type SpellInfo } from '../../src/lib/spellLibrary';
import { spellKeyOf } from '../../src/lib/schemas/spell';

const spell = (name: string, key: string, path: string): SpellInfo => ({
  name, key, path, level: 1, classes: ['cleric'], school: 'evocation',
});

describe('dedupeSpellsByKey', () => {
  it('behält pro Key den ersten Eintrag', () => {
    const out = dedupeSpellsByKey([
      spell('Segnen', 'srd-2024_bless', './vault/spells/bannmagie/segnen.json'),
      spell('Segnen', 'srd-2024_bless', './vault/spells/paket-2/segnen.json'),
      spell('Heilendes Wort', 'srd-2024_healing-word', './vault/spells/hervorrufung/heilendes-wort.json'),
    ]);
    expect(out.map((s) => s.path)).toEqual([
      './vault/spells/bannmagie/segnen.json',
      './vault/spells/hervorrufung/heilendes-wort.json',
    ]);
  });

  it('lässt alle keylosen Zauber stehen', () => {
    const out = dedupeSpellsByKey([
      spell('Segnen', '', './vault/spells/alt/segnen.json'),
      spell('Führung', '', './vault/spells/alt/fuehrung.json'),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('Key-Ableitung im Index', () => {
  it('leitet Herkunft plus englischen Namen ab', () => {
    expect(spellKeyOf({ name: 'Segnen', name_en: 'Bless', source: 'srd-2024' })).toBe('srd-2024_bless');
  });

  // Umlaut wird zum Trenner, nicht transliteriert (`slugAscii`) — stabil, aber nicht der
  // Open5e-Key: ohne `name_en` bleibt nur der deutsche Name.
  it('fällt ohne name_en auf den deutschen Namen zurück', () => {
    expect(spellKeyOf({ name: 'Führung', source: 'srd-2024' })).toBe('srd-2024_f-hrung');
  });

  it('nimmt ohne Herkunft die eigene', () => {
    expect(spellKeyOf({ name: 'Waldis Wutschrei' })).toBe('homebrew-sam_waldis-wutschrei');
  });
});
