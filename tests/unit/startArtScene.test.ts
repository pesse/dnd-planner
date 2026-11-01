/**
 * Lebenslauf und Platzierung der schwebenden Startseiten-Bilder.
 *
 *   npm run test -- startArtScene
 */
import { describe, expect, it } from 'vitest';
import { isDead, spawnSprite, spriteAlpha, type Rect } from '../../src/lib/services/startArt/scene';
import { sortArt } from '../../src/lib/services/startArt/artPool';

const view: Rect = { x: 0, y: 0, w: 1600, h: 900 };
const keepOut: Rect = { x: 550, y: 250, w: 500, h: 400 };
const source = {} as CanvasImageSource;

function seeded(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

describe('spriteAlpha', () => {
  const s = spawnSprite('icon', source, 1, { view, keepOut, others: [], now: 1000, rand: seeded(7) });

  it('blendet ein, hält und blendet wieder aus', () => {
    expect(spriteAlpha(s, 1000)).toBe(0);
    expect(spriteAlpha(s, 2000)).toBeGreaterThan(0);
    expect(spriteAlpha(s, 2000)).toBeLessThan(s.maxAlpha);
    expect(spriteAlpha(s, 1000 + s.life / 2)).toBeCloseTo(s.maxAlpha);
    expect(spriteAlpha(s, 1000 + s.life - 500)).toBeLessThan(s.maxAlpha);
    expect(spriteAlpha(s, 1000 + s.life)).toBe(0);
    expect(isDead(s, 1000 + s.life)).toBe(true);
  });
});

describe('spawnSprite', () => {
  it('legt Icons neben den Inhalt, solange Platz ist', () => {
    const rand = seeded(3);
    for (let i = 0; i < 30; i++) {
      const s = spawnSprite('icon', source, 1, { view, keepOut, others: [], now: 0, rand });
      const inside = s.x > keepOut.x && s.x < keepOut.x + keepOut.w && s.y > keepOut.y && s.y < keepOut.y + keepOut.h;
      expect(inside).toBe(false);
    }
  });
});

describe('sortArt', () => {
  it('trennt Figuren von Icons und lässt Fremdes und die Gliederpuppe weg', () => {
    const pool = sortArt([
      'figures/elf-feminine/species',
      'figures/elf-feminine/paperdoll',
      'combos/human-wizard',
      'spells/fireball',
      'monsters/aboleth',
      'something/else',
    ]);
    expect(pool.figures).toEqual(['/art/figures/elf-feminine/species.avif', '/art/combos/human-wizard.avif']);
    expect(pool.icons).toEqual(['/art/spells/fireball.avif', '/art/monsters/aboleth.avif']);
  });
});
