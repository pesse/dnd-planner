import { describe, expect, it } from 'vitest';
import { frameFromDrag, hitFrame, moveFrame, resizeFrame, scaleFrame } from '../../src/lib/services/battleMap/viewFrame';

const r = { x: 100, y: 100, w: 160, h: 90 };

describe('Spieler-Ausschnitt', () => {
  it('zieht einen Rahmen in jede Richtung im Seitenverhältnis auf', () => {
    expect(frameFromDrag({ x: 0, y: 0 }, { x: 160, y: 10 }, 16 / 9)).toEqual({ x: 0, y: 0, w: 160, h: 90 });
    expect(frameFromDrag({ x: 0, y: 0 }, { x: -10, y: -90 }, 16 / 9)).toEqual({ x: -160, y: -90, w: 160, h: 90 });
  });

  it('hält beim Skalieren an einer Ecke die gegenüberliegende fest', () => {
    const out = resizeFrame(r, 'se', { x: 420, y: 150 }, 16 / 9);
    expect(out).toEqual({ x: 100, y: 100, w: 320, h: 180 });
    const nw = resizeFrame(r, 'nw', { x: 180, y: 180 }, 16 / 9);
    expect(nw.x + nw.w).toBe(260);
    expect(nw.y + nw.h).toBe(190);
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
