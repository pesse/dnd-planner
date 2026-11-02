/** Den Spieler-Ausschnitt als Rahmen verschieben und skalieren. */
import type { ViewRect } from '../../schemas/battleMap';
import { normalizeRect, type Point } from './geometry';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export type FrameHit = Corner | 'move';

export const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

export function cornerPoint(r: ViewRect, c: Corner): Point {
  return { x: c[1] === 'w' ? r.x : r.x + r.w, y: c[0] === 'n' ? r.y : r.y + r.h };
}

const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };

/** Die gegenüberliegende Ecke bleibt stehen. */
export const resizeFrame = (start: ViewRect, corner: Corner, p: Point): ViewRect =>
  normalizeRect(cornerPoint(start, OPPOSITE[corner]), p);

export const moveFrame = (start: ViewRect, from: Point, to: Point): ViewRect => ({
  ...start,
  x: start.x + to.x - from.x,
  y: start.y + to.y - from.y,
});

export function scaleFrame(r: ViewRect, factor: number, minW: number): ViewRect {
  const w = Math.max(minW, r.w * factor);
  const h = (w / r.w) * r.h;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

/** Ecken haben Vorrang vor der Fläche; `tol` in Bildpixeln. */
export function hitFrame(r: ViewRect, p: Point, tol: number): FrameHit | null {
  for (const c of CORNERS) {
    const q = cornerPoint(r, c);
    if (Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol) return c;
  }
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h ? 'move' : null;
}

export const FRAME_CURSOR: Record<FrameHit, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  move: 'move',
};
