import { describe, expect, it } from 'vitest';
import { hitFrame, moveFrame, resizeFrame, scaleFrame } from '../../src/lib/services/battleMap/viewFrame';

const r = { x: 100, y: 100, w: 160, h: 90 };

describe('Spieler-Ausschnitt', () => {
  it('hält beim Skalieren an einer Ecke die gegenüberliegende fest', () => {
    expect(resizeFrame(r, 'se', { x: 420, y: 150 })).toEqual({ x: 100, y: 100, w: 320, h: 50 });
    expect(resizeFrame(r, 'nw', { x: 180, y: 180 })).toEqual({ x: 180, y: 180, w: 80, h: 10 });
    expect(resizeFrame(r, 'ne', { x: 50, y: 300 })).toEqual({ x: 50, y: 190, w: 50, h: 110 });
  });

  it('verschiebt und skaliert um die Mitte mit Mindestbreite', () => {
    expect(moveFrame(r, { x: 0, y: 0 }, { x: 10, y: -5 })).toEqual({ x: 110, y: 95, w: 160, h: 90 });
    expect(scaleFrame(r, 2, 10)).toEqual({ x: 20, y: 55, w: 320, h: 180 });
    expect(scaleFrame(r, 0.01, 80).w).toBe(80);
  });

  it('trifft Ecken vor der Fläche', () => {
    expect(hitFrame(r, { x: 103, y: 98 }, 6)).toBe('nw');
    expect(hitFrame(r, { x: 258, y: 191 }, 6)).toBe('se');
    expect(hitFrame(r, { x: 180, y: 140 }, 6)).toBe('move');
    expect(hitFrame(r, { x: 50, y: 50 }, 6)).toBeNull();
  });
});
