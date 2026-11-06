import { describe, expect, it } from 'vitest';
import { buildMapPrompt } from '../../src/lib/services/battleMap/mapImagePrompt';

describe('buildMapPrompt', () => {
  it('setzt die flachen Wände nur bei Innenräumen ein', () => {
    expect(buildMapPrompt('A tavern', 'indoor', 'painted')).toContain('Dungeondraft');
    expect(buildMapPrompt('A forest', 'outdoor', 'painted')).not.toContain('Dungeondraft');
  });

  it('beginnt mit der Szene und schließt sie mit einem Punkt ab', () => {
    expect(buildMapPrompt('  A crypt  ', 'outdoor', 'dark')).toMatch(/^A crypt\. Top-down/);
    expect(buildMapPrompt('A crypt.', 'outdoor', 'dark')).toMatch(/^A crypt\. Top-down/);
  });

  it('hängt den gewählten Stil an', () => {
    expect(buildMapPrompt('A crypt', 'indoor', 'dark')).toMatch(/torchlight pools\.$/);
  });
});
