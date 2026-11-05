/**
 * Nebel und Dunkelheit als Canvas. Beide Leinwände decken das ganze Bild ab, aber in
 * verringerter Auflösung (`scale`) — eine 6000-px-Karte bräuchte sonst 140 MB pro Ebene.
 */
import type { FogOp, Grid, Light, Token, TokenLight } from '../../schemas/battleMap';

export type LightSpot = Pick<Light, 'id' | 'x' | 'y' | 'radius' | 'color'>;

const MAX_CANVAS_EDGE = 2048;

export const overlayScale = (imgW: number, imgH: number): number =>
  Math.min(1, MAX_CANVAS_EDGE / Math.max(imgW, imgH, 1));

function traceOp(ctx: CanvasRenderingContext2D, op: FogOp): void {
  if (op.shape === 'rect') {
    ctx.fillRect(op.x, op.y, op.w, op.h);
    return;
  }
  ctx.lineWidth = op.r * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const [first, ...rest] = op.points;
  if (!first) return;
  ctx.moveTo(first[0], first[1]);
  // Ein einzelner Klick ist eine Linie der Länge 0 — die zeichnet nur mit rundem Ende.
  if (!rest.length) ctx.lineTo(first[0] + 0.01, first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.stroke();
}

/** Zugedeckt beginnen, dann jede Operation der Reihe nach: aufdecken radiert, zudecken malt. */
export function drawFog(canvas: HTMLCanvasElement, ops: FogOp[], imgW: number, imgH: number, color: string): void {
  const scale = overlayScale(imgW, imgH);
  const w = Math.max(1, Math.round(imgW * scale));
  const h = Math.max(1, Math.round(imgH * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.strokeStyle = color;
  for (const op of ops) {
    ctx.globalCompositeOperation = op.mode === 'reveal' ? 'destination-out' : 'source-over';
    traceOp(ctx, op);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Ein leuchtendes Token strahlt aus seiner Mitte, in Bildpixeln wie die festen Lichter. */
export function tokenLights(
  tokens: readonly (Pick<Token, 'id' | 'x' | 'y' | 'size'> & { light?: TokenLight | null })[],
  grid: Grid,
): LightSpot[] {
  return tokens.flatMap((t) =>
    t.light
      ? [{ id: t.id, x: grid.offsetX + (t.x + t.size / 2) * grid.size, y: grid.offsetY + (t.y + t.size / 2) * grid.size, ...t.light }]
      : [],
  );
}

const FLICKER_AMPLITUDE = 0.04;

/** FNV-1a, auf [0, 1) gestaucht. */
function hashUnit(text: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 2 ** 32;
}

/** Glattes Wertrauschen in [-1, 1]: ein Zufallswert je ganzer Zeiteinheit, dazwischen Kosinus-Übergang. */
function valueNoise(seed: string, t: number): number {
  const i = Math.floor(t);
  const blend = (1 - Math.cos((t - i) * Math.PI)) / 2;
  const a = hashUnit(seed, i) * 2 - 1;
  const b = hashUnit(seed, i + 1) * 2 - 1;
  return a + (b - a) * blend;
}

/**
 * Radius schwankt um höchstens ±`FLICKER_AMPLITUDE`. Rauschen und Tempo hängen an der `id`, nicht am
 * Ort — sonst flackert ein gezogenes Token mit jedem Pixel wild.
 */
export function flickerLights(lights: readonly LightSpot[], seconds: number): LightSpot[] {
  return lights.map((l) => {
    const tempo = 0.8 + 0.6 * hashUnit(l.id, -1);
    const wave = 0.65 * valueNoise(l.id, seconds * 2.2 * tempo) + 0.35 * valueNoise(l.id + '~', seconds * 6.1 * tempo);
    return { ...l, radius: l.radius * (1 + FLICKER_AMPLITUDE * wave) };
  });
}

/** Innere Hälfte hell, äußere dämmrig — bei Kerze, Fackel, Laterne und *Licht* (SRD) sind beide gleich breit. */
const LIGHT_FALLOFF: readonly [at: number, alpha: number][] = [
  [0, 1],
  [0.45, 1],
  [0.55, 0.5],
  [0.92, 0.5],
  [1, 0],
];

/** Dunkelheit mit weichen Lichtkreisen; darüber ein Farbschimmer je Licht. */
export function drawLighting(
  canvas: HTMLCanvasElement,
  lighting: { darkness: number; lights: readonly LightSpot[] },
  grid: Grid,
  imgW: number,
  imgH: number,
): void {
  const scale = overlayScale(imgW, imgH);
  const w = Math.max(1, Math.round(imgW * scale));
  const h = Math.max(1, Math.round(imgH * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  if (lighting.darkness <= 0) return;

  ctx.fillStyle = `rgba(4, 6, 18, ${lighting.darkness})`;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.globalCompositeOperation = 'destination-out';
  for (const l of lighting.lights) {
    const r = l.radius * grid.size;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    for (const [at, alpha] of LIGHT_FALLOFF) g.addColorStop(at, `rgba(0,0,0,${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  }

  ctx.globalCompositeOperation = 'source-over';
  for (const l of lighting.lights) {
    const r = l.radius * grid.size;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, hexToRgba(l.color, 0.22));
    g.addColorStop(1, hexToRgba(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,180,80,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
