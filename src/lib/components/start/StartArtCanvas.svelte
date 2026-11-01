<script lang="ts">
  import { onMount } from 'svelte';
  import { fillStartArtPool, type StartArtPool } from '$lib/services/startArt/artPool';
  import {
    drawSprite, featherFigure, isDead, spawnSprite, type Rect, type Sprite, type SpriteKind,
  } from '$lib/services/startArt/scene';

  /** Der Bereich, den die Bilder meiden sollen, relativ zum Canvas. */
  let { keepOut }: { keepOut: () => Rect | null } = $props();

  let canvas: HTMLCanvasElement;

  interface Loaded { source: CanvasImageSource; aspect: number }

  const SPAWN_GAP = 650;
  const FIRST_GAP = 220;

  async function load(url: string, kind: SpriteKind): Promise<Loaded | null> {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      return null;
    }
    const aspect = img.naturalWidth / img.naturalHeight;
    return { source: kind === 'figure' ? featherFigure(img) : img, aspect };
  }

  onMount(() => {
    const g = canvas.getContext('2d')!;
    const pool: StartArtPool = { figures: [], icons: [] };
    void fillStartArtPool(pool);

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sprites: Sprite[] = [];
    const loading = { figure: false, icon: false };
    const recent: string[] = [];
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let view: Rect = { x: 0, y: 0, w: 0, h: 0 };
    let lastSpawn = -Infinity;
    let spawned = 0;
    let frame = 0;

    function resize() {
      const dpr = devicePixelRatio || 1;
      view = { x: 0, y: 0, w: canvas.clientWidth, h: canvas.clientHeight };
      canvas.width = Math.round(view.w * dpr);
      canvas.height = Math.round(view.h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Zufällig, aber nicht dasselbe Bild zweimal kurz hintereinander. */
    function pick(urls: string[]): string | null {
      for (let i = 0; i < 8 && urls.length; i++) {
        const url = urls[Math.floor(Math.random() * urls.length)];
        if (!recent.includes(url)) return url;
      }
      return null;
    }

    async function request(kind: SpriteKind) {
      const urls = kind === 'figure' ? pool.figures : pool.icons;
      const url = pick(urls);
      if (!url) return;
      loading[kind] = true;
      recent.push(url);
      if (recent.length > 40) recent.shift();
      const loaded = await load(url, kind);
      loading[kind] = false;
      if (!loaded) {
        urls.splice(urls.indexOf(url), 1);
        return;
      }
      const s = spawnSprite(kind, loaded.source, loaded.aspect, {
        view, keepOut: keepOut() ?? { x: 0, y: 0, w: 0, h: 0 }, others: sprites, now: performance.now(),
      });
      if (still) { s.dx = 0; s.dy = 0; s.drot = 0; s.life *= 1.6; }
      sprites.push(s);
      spawned++;
    }

    function wanted(kind: SpriteKind): number {
      if (kind === 'figure') return view.w > 1800 ? 3 : 2;
      return Math.max(5, Math.min(14, Math.round((view.w * view.h) / 85000)));
    }

    function tick(now: number) {
      for (let i = sprites.length - 1; i >= 0; i--) if (isDead(sprites[i], now)) sprites.splice(i, 1);
      if (now - lastSpawn > (spawned < 6 ? FIRST_GAP : SPAWN_GAP)) {
        const kinds = (['figure', 'icon'] as const).filter(
          (k) => !loading[k] && sprites.filter((s) => s.kind === k).length < wanted(k),
        );
        if (kinds.length) {
          lastSpawn = now;
          void request(kinds[Math.floor(Math.random() * kinds.length)]);
        }
      }
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      g.clearRect(0, 0, view.w, view.h);
      const p = still ? { x: 0, y: 0 } : pointer;
      for (const s of [...sprites].sort((a, b) => a.depth - b.depth)) drawSprite(g, s, now, p);
      frame = requestAnimationFrame(tick);
    }

    function onPointer(e: PointerEvent) {
      pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / innerHeight) * 2 - 1;
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    addEventListener('pointermove', onPointer);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      removeEventListener('pointermove', onPointer);
    };
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
