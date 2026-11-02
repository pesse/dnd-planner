/** Umrechnung zwischen Bildpixeln, Feldern und Bildschirm; reine Funktionen. */
import type { Grid, Token, ViewRect } from '../../schemas/battleMap';

export interface Point {
  x: number;
  y: number;
}

/** Bildschirm = Bild × zoom + (tx, ty). */
export interface Camera {
  zoom: number;
  tx: number;
  ty: number;
}

export const toImage = (cam: Camera, p: Point): Point => ({ x: (p.x - cam.tx) / cam.zoom, y: (p.y - cam.ty) / cam.zoom });

export const cellToPx = (grid: Grid, cx: number, cy: number): Point => ({
  x: grid.offsetX + cx * grid.size,
  y: grid.offsetY + cy * grid.size,
});

export const pxToCell = (grid: Grid, p: Point): Point => ({
  x: (p.x - grid.offsetX) / grid.size,
  y: (p.y - grid.offsetY) / grid.size,
});

/** Halbe Felder rasten auf halbe Felder ein, damit ein Winzling in die Ecke passt. */
export function snapCell(value: number, size: number): number {
  const step = size < 1 ? 0.5 : 1;
  return Math.round(value / step) * step;
}

export const tokenRect = (grid: Grid, t: Token): ViewRect => {
  const p = cellToPx(grid, t.x, t.y);
  return { x: p.x, y: p.y, w: t.size * grid.size, h: t.size * grid.size };
};

/** 2024er Regel: eine Diagonale kostet ein Feld wie eine Gerade. */
export function distanceCells(grid: Grid, a: Point, b: Point): number {
  const dx = Math.abs(b.x - a.x) / grid.size;
  const dy = Math.abs(b.y - a.y) / grid.size;
  return Math.round(Math.max(dx, dy));
}

export const formatMeters = (cells: number, metersPerCell: number): string =>
  `${(cells * metersPerCell).toLocaleString('de-DE', { maximumFractionDigits: 1 })} m`;

const SIZE_CELLS: Record<string, number> = {
  Tiny: 0.5,
  Small: 1,
  Medium: 1,
  Large: 2,
  Huge: 3,
  Gargantuan: 4,
};

export const cellsForCreatureSize = (size: string | undefined): number => SIZE_CELLS[size ?? ''] ?? 1;

/** Die Kamera, die `rect` vollständig und zentriert in einen Bereich `w`×`h` legt. */
export function fitRect(rect: ViewRect, w: number, h: number): Camera {
  const zoom = Math.min(w / rect.w, h / rect.h);
  return {
    zoom,
    tx: w / 2 - (rect.x + rect.w / 2) * zoom,
    ty: h / 2 - (rect.y + rect.h / 2) * zoom,
  };
}

/** Der sichtbare Bildausschnitt einer Kamera in einem Bereich `w`×`h`. */
export function visibleRect(cam: Camera, w: number, h: number): ViewRect {
  const tl = toImage(cam, { x: 0, y: 0 });
  return { x: tl.x, y: tl.y, w: w / cam.zoom, h: h / cam.zoom };
}

/** Zoom um einen Bildschirmpunkt, der dabei an seiner Stelle bleibt. */
export function zoomAt(cam: Camera, screen: Point, factor: number, min = 0.05, max = 8): Camera {
  const zoom = Math.min(max, Math.max(min, cam.zoom * factor));
  const img = toImage(cam, screen);
  return { zoom, tx: screen.x - img.x * zoom, ty: screen.y - img.y * zoom };
}

/** Aus einem gezogenen Rechteck über genau einem Feld. */
export function gridFromCell(rect: ViewRect): Pick<Grid, 'size' | 'offsetX' | 'offsetY'> {
  const size = Math.max(4, (Math.abs(rect.w) + Math.abs(rect.h)) / 2);
  const x = Math.min(rect.x, rect.x + rect.w);
  const y = Math.min(rect.y, rect.y + rect.h);
  const mod = (v: number) => ((v % size) + size) % size;
  return { size, offsetX: mod(x), offsetY: mod(y) };
}

export const normalizeRect = (a: Point, b: Point): ViewRect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
});
