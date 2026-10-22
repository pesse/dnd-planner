<script lang="ts">
  /** Ein Würfel in der Form seiner Seitenzahl; `roll` wechselt je Wurf und startet das Rollen. */
  import { onDestroy } from 'svelte';

  let { sides, value, roll = 0, delay = 0 }: { sides: number; value: number; roll?: number; delay?: number } = $props();

  const SHAPES: Record<number, string> = {
    4: '50,6 95,90 5,90',
    6: '12,12 88,12 88,88 12,88',
    8: '50,3 95,50 50,97 5,50',
    10: '50,3 94,42 50,97 6,42',
    12: '50,3 96,37 78,95 22,95 4,37',
    20: '50,2 93,26 93,74 50,98 7,74 7,26',
  };
  const shape = $derived(SHAPES[sides] ?? SHAPES[6]);
  const textY = $derived(sides === 4 ? 70 : sides === 10 ? 55 : 60);

  const DURATION = 650;
  let shown = $state(0);
  let rolling = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    void roll;
    const final = value;
    clearInterval(timer);
    rolling = true;
    const start = performance.now();
    timer = setInterval(() => {
      if (performance.now() - start < DURATION + delay) {
        shown = 1 + Math.floor(Math.random() * sides);
        return;
      }
      clearInterval(timer);
      shown = final;
      rolling = false;
    }, 60);
  });
  onDestroy(() => clearInterval(timer));
</script>

<svg
  class="die"
  class:rolling
  class:max={!rolling && shown === sides}
  class:min={!rolling && shown === 1}
  viewBox="0 0 100 100"
  style="--delay: {delay}ms"
  role="img"
  aria-label="W{sides}: {value}"
>
  <defs>
    <linearGradient id="die-face" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" class="light" />
      <stop offset="100%" class="dark" />
    </linearGradient>
  </defs>
  <polygon points={shape} class="face" />
  <text x="50" y={textY} text-anchor="middle">{shown || value}</text>
</svg>

<style>
  .die { width: 3.2rem; height: 3.2rem; overflow: visible; filter: drop-shadow(0 3px 4px rgba(40, 20, 0, 0.35)); }
  .light { stop-color: color-mix(in srgb, var(--arcane) 65%, white); }
  .dark { stop-color: var(--arcane); }
  .face { fill: url(#die-face); stroke: var(--gold); stroke-width: 3; stroke-linejoin: round; }
  text { font-family: var(--font-display); font-weight: 700; font-size: 34px; fill: #fff; paint-order: stroke; stroke: rgba(30, 10, 40, 0.45); stroke-width: 3px; }
  .rolling { animation: tumble 0.65s cubic-bezier(0.3, 0.7, 0.4, 1) var(--delay) both; }
  .max { filter: drop-shadow(0 0 8px var(--gold)); }
  .max .face { stroke-width: 5; }
  .min text { fill: color-mix(in srgb, var(--danger) 40%, white); }
  @keyframes tumble {
    0% { transform: translate(-30px, -16px) rotate(-260deg) scale(0.6); opacity: 0; }
    60% { transform: translate(4px, 3px) rotate(18deg) scale(1.08); opacity: 1; }
    80% { transform: translate(-2px, 0) rotate(-6deg) scale(0.97); }
    100% { transform: none; }
  }
</style>
