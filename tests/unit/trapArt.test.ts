import { describe, expect, it } from 'vitest';
import { trapArtUrl } from '../../src/lib/libraryArt';
import { TRAP_ICON_URL } from '../../src/lib/conditionIcon';

describe('trapArtUrl', () => {
  const art = new Set(['traps/hidden-pit', 'traps/hidden-pit-triggered', 'traps/spiked-pit']);

  it('nimmt das Bild der Falle, ausgelöst die Variante', () => {
    expect(trapArtUrl('dmg-2024_hidden-pit', art)).toBe('/art/traps/hidden-pit.avif');
    expect(trapArtUrl('dmg-2024_hidden-pit', art, true)).toBe('/art/traps/hidden-pit-triggered.avif');
  });

  it('fällt auf das scharfe Bild und zuletzt auf das Fangeisen zurück', () => {
    expect(trapArtUrl('dmg-2024_spiked-pit', art, true)).toBe('/art/traps/spiked-pit.avif');
    expect(trapArtUrl('homebrew-sam_eigene-falle', art)).toBe(TRAP_ICON_URL);
    expect(trapArtUrl(undefined, art)).toBe(TRAP_ICON_URL);
  });
});
