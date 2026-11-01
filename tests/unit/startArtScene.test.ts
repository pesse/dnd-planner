/**
 * Lebenslauf und Platzierung der schwebenden Startseiten-Bilder.
 *
 *   npm run test -- startArtScene
 */
import { describe, expect, it } from 'vitest';
import { isDead, spawnSprite, spriteAlpha, type Rect } from '../../src/lib/services/startArt/scene';
import { figureArt } from '../../src/lib/services/startArt/artPool';

const view: Rect = { x: 0, y: 0, w: 1600, h: 900 };
const keepOut: Rect = { x: 550, y: 250, w: 500, h: 400 };
const source = {} as CanvasImageSource;

function seeded(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

describe('spriteAlpha', () => {
  const s = spawnSprite(source, 0.66, { view, keepOut, others: [], now: 1000, rand: seeded(7) });

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
  it('hält Abstand zwischen den Figuren, solange Platz ist', () => {
    const rand = seeded(3);
    const others = [spawnSprite(source, 0.66, { view, keepOut, others: [], now: 0, rand })];
    const next = spawnSprite(source, 0.66, { view, keepOut, others, now: 0, rand });
    expect(Math.abs(next.x - others[0].x)).toBeGreaterThan(others[0].w / 2);
  });
});

describe('figureArt', () => {
  it('nimmt nur Figuren-Szenen, ohne Gliederpuppe und Icons', () => {
    expect(figureArt([
      'figures/elf-feminine/species',
      'figures/elf-feminine/paperdoll',
      'combos/human-wizard',
      'spells/fireball',
      'monsters/aboleth',
    ])).toEqual(['/art/figures/elf-feminine/species.avif', '/art/combos/human-wizard.avif']);
  });
});
