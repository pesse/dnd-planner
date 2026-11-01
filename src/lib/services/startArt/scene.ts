/** Die schwebenden Bilder der Startseite: Lebenslauf, Platzierung und Zeichnen eines Sprites. */

export type SpriteKind = 'figure' | 'icon';

export interface Rect { x: number; y: number; w: number; h: number }

export interface Sprite {
  kind: SpriteKind;
  source: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 = weit hinten (klein, blass, träge), 1 = vorn. */
  depth: number;
  born: number;
  life: number;
  dx: number;
  dy: number;
  rot0: number;
  drot: number;
  bob: number;
  maxAlpha: number;
}

const FADE_IN = 2200;
const FADE_OUT = 2600;

const smooth = (t: number): number => t * t * (3 - 2 * t);

export function spriteAlpha(s: Sprite, now: number): number {
  const age = now - s.born;
  if (age <= 0 || age >= s.life) return 0;
  const fade = Math.min(1, age / FADE_IN, (s.life - age) / FADE_OUT);
  return s.maxAlpha * smooth(fade);
}

export const isDead = (s: Sprite, now: number): boolean => now - s.born >= s.life;

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const boundsOf = (s: Pick<Sprite, 'x' | 'y' | 'w' | 'h'>): Rect => ({ x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h });

/**
 * Bester von mehreren Zufallsplätzen: am wenigsten Deckung mit dem Inhalt und den schon
 * sichtbaren Bildern. Figuren bleiben an den Rändern, wo der Inhalt sie nicht verdeckt.
 */
function place(kind: SpriteKind, w: number, h: number, view: Rect, keepOut: Rect, others: Sprite[], rand: () => number) {
  let best = { x: 0, y: 0, cost: Infinity };
  for (let i = 0; i < 14; i++) {
    const left = rand() < 0.5;
    const x = kind === 'figure'
      ? (left ? view.w * (0.04 + rand() * 0.2) : view.w * (0.76 + rand() * 0.2))
      : w / 2 + rand() * (view.w - w);
    const y = kind === 'figure' ? view.h * (0.35 + rand() * 0.3) : h / 2 + rand() * (view.h - h);
    const r = boundsOf({ x, y, w, h });
    const cost = overlap(r, keepOut) * (kind === 'figure' ? 0.4 : 3) +
      others.reduce((sum, o) => sum + overlap(r, boundsOf(o)) * (o.kind === kind ? 2 : 0.6), 0);
    if (cost < best.cost) best = { x, y, cost };
  }
  return best;
}

export interface SpawnContext {
  view: Rect;
  keepOut: Rect;
  others: Sprite[];
  now: number;
  rand?: () => number;
}

export function spawnSprite(kind: SpriteKind, source: CanvasImageSource, aspect: number, ctx: SpawnContext): Sprite {
  const rand = ctx.rand ?? Math.random;
  const depth = kind === 'figure' ? 0.55 + rand() * 0.35 : 0.25 + rand() * 0.75;
  const short = Math.min(ctx.view.w, ctx.view.h);
  const h = kind === 'figure' ? short * (0.5 + depth * 0.3) : short * (0.07 + depth * 0.09);
  const w = h * aspect;
  const { x, y } = place(kind, w, h, ctx.view, ctx.keepOut, ctx.others, rand);
  const drift = (kind === 'figure' ? 30 : 70) * (0.4 + depth * 0.6);
  const angle = rand() * Math.PI * 2;
  return {
    kind, source, x, y, w, h, depth,
    born: ctx.now,
    life: kind === 'figure' ? 11000 + rand() * 5000 : 7000 + rand() * 6000,
    dx: Math.cos(angle) * drift,
    dy: Math.sin(angle) * drift,
    rot0: kind === 'icon' ? (rand() - 0.5) * 0.5 : 0,
    drot: kind === 'icon' ? (rand() - 0.5) * 0.35 : 0,
    bob: rand() * Math.PI * 2,
    maxAlpha: kind === 'figure' ? 0.42 + depth * 0.2 : 0.35 + depth * 0.5,
  };
}

/** `pointer` −1…1 je Achse; vordere Bilder folgen ihm stärker. */
export function drawSprite(g: CanvasRenderingContext2D, s: Sprite, now: number, pointer: { x: number; y: number }) {
  const alpha = spriteAlpha(s, now);
  if (alpha <= 0.002) return;
  const t = Math.min(1, (now - s.born) / s.life);
  const ease = smooth(t);
  const parallax = 14 * s.depth;
  const float = s.kind === 'icon' ? Math.sin(now / 1400 + s.bob) * 6 * s.depth : 0;
  const scale = s.kind === 'figure' ? 1 + 0.06 * ease : 0.88 + 0.12 * smooth(Math.min(1, (now - s.born) / FADE_IN));
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = s.kind === 'figure' ? 'multiply' : 'source-over';
  g.translate(s.x + s.dx * ease + pointer.x * parallax, s.y + s.dy * ease + float + pointer.y * parallax);
  g.rotate(s.rot0 + s.drot * ease);
  g.scale(scale, scale);
  g.drawImage(s.source, -s.w / 2, -s.h / 2, s.w, s.h);
  g.restore();
}

/** Figuren haben einen Pergamentgrund — ohne weichen Rand stünden sie als Rechteck im Bild. */
export function featherFigure(img: HTMLImageElement, maxH = 900): HTMLCanvasElement {
  const scale = Math.min(1, maxH / img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  const r = Math.max(c.width, c.height) / 2;
  const mask = g.createRadialGradient(r, r, r * 0.35, r, r, r);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.setTransform(c.width / (2 * r), 0, 0, c.height / (2 * r), 0, 0);
  g.fillStyle = mask;
  g.fillRect(0, 0, 2 * r, 2 * r);
  return c;
}
