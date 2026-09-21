/**
 * Zauberverweise im Regeltext: das eigene `spell:`-Schema muss durch `marked` kommen,
 * sonst steht im Vault Markup, das im HTML nie als Link ankommt.
 *
 *   npm run test -- spellRefs
 */
import { describe, expect, it } from 'vitest';
import { SPELL_REF_SCHEME, spellRefKey } from '../../src/lib/services/vaultLinks';
import { renderMarkdown, renderMarkdownInline } from '../../src/lib/utils/markdown';

describe('spellRefKey', () => {
  it('liest den Key aus dem Verweis', () => {
    expect(spellRefKey(`${SPELL_REF_SCHEME}srd-2024_fireball`)).toBe('srd-2024_fireball');
  });

  it('lässt Vault-Pfade und externe Links in Ruhe', () => {
    expect(spellRefKey('../spells/feuerball.json')).toBe('');
    expect(spellRefKey('https://example.org/spell:x')).toBe('');
    expect(spellRefKey('')).toBe('');
  });
});

describe('Markdown-Ausgabe', () => {
  it('behält das Schema im href', () => {
    expect(renderMarkdown('Du wirkst [Feuerball](spell:srd-2024_fireball).'))
      .toContain('href="spell:srd-2024_fireball"');
  });

  it('behält es auch in Tabellenzellen und inline', () => {
    const table = renderMarkdown('| Stufe | Zauber |\n|---|---|\n| 3 | [Blitz](spell:srd-2024_lightning-bolt) |');
    expect(table).toContain('href="spell:srd-2024_lightning-bolt"');
    expect(renderMarkdownInline('[Licht](spell:srd-2024_light)')).toContain('href="spell:srd-2024_light"');
  });
});
