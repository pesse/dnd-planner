/** Die schwebenden Figuren der Startseite: Lebenslauf, Platzierung und Zeichnen eines Sprites. */

export interface Rect { x: number; y: number; w: number; h: number }

export interface Sprite {
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

/** Bester von mehreren Zufallsplätzen: am wenigsten Deckung mit dem Inhalt und den schon sichtbaren Figuren. */
function place(w: number, h: number, view: Rect, keepOut: Rect, others: Sprite[], rand: () => number) {
  let best = { x: 0, y: 0, cost: Infinity };
  for (let i = 0; i < 18; i++) {
    const x = w * 0.3 + rand() * (view.w - w * 0.6);
    const y = h * 0.3 + rand() * (view.h - h * 0.6);
    const r = boundsOf({ x, y, w, h });
    const cost = overlap(r, keepOut) * 0.15 + others.reduce((sum, o) => sum + overlap(r, boundsOf(o)), 0);
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

export function spawnSprite(source: CanvasImageSource, aspect: number, ctx: SpawnContext): Sprite {
  const rand = ctx.rand ?? Math.random;
  const depth = 0.1 + rand() * 0.9;
  const short = Math.min(ctx.view.w, ctx.view.h);
  const h = short * (0.3 + depth * 0.65);
  const w = h * aspect;
  const { x, y } = place(w, h, ctx.view, ctx.keepOut, ctx.others, rand);
  const drift = 110 * (0.4 + depth * 0.6);
  const angle = rand() * Math.PI * 2;
  return {
    source, x, y, w, h, depth,
    born: ctx.now,
    life: 8000 + rand() * 4000,
    dx: Math.cos(angle) * drift,
    dy: Math.sin(angle) * drift,
    rot0: (rand() - 0.5) * 0.08,
    drot: (rand() - 0.5) * 0.1,
    bob: rand() * Math.PI * 2,
    maxAlpha: Math.min(1, 0.35 + depth * 0.8),
  };
}

/** `pointer` −1…1 je Achse; vordere Bilder folgen ihm stärker. */
export function drawSprite(g: CanvasRenderingContext2D, s: Sprite, now: number, pointer: { x: number; y: number }) {
  const alpha = spriteAlpha(s, now);
  if (alpha <= 0.002) return;
  const t = Math.min(1, (now - s.born) / s.life);
  const ease = smooth(t);
  const parallax = 110 * s.depth;
  const float = Math.sin(now / 1700 + s.bob) * 7 * s.depth;
  const grow = smooth(Math.min(1, (now - s.born) / FADE_IN));
  const scale = 0.92 + 0.08 * grow + 0.06 * ease;
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'multiply';
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
