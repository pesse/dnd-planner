/**
 * Lebenslauf und Platzierung der schwebenden Startseiten-Bilder.
 *
 *   npm run test -- startArtScene
 */
import { describe, expect, it } from 'vitest';
import { isDead, spawnSprite, spriteAlpha, type Rect } from '../../src/lib/services/startArt/scene';

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
  it('stellt Figuren an den Rand, nie mittig auf den Inhalt', () => {
    const rand = seeded(42);
    for (let i = 0; i < 30; i++) {
      const s = spawnSprite('figure', source, 0.66, { view, keepOut, others: [], now: 0, rand });
      expect(s.x < view.w * 0.25 || s.x > view.w * 0.75).toBe(true);
    }
  });

  it('legt Icons neben den Inhalt, solange Platz ist', () => {
    const rand = seeded(3);
    for (let i = 0; i < 30; i++) {
      const s = spawnSprite('icon', source, 1, { view, keepOut, others: [], now: 0, rand });
      const inside = s.x > keepOut.x && s.x < keepOut.x + keepOut.w && s.y > keepOut.y && s.y < keepOut.y + keepOut.h;
      expect(inside).toBe(false);
    }
  });
});
