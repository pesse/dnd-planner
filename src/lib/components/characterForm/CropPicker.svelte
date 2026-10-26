<script lang="ts">
  /** Rahmen über einem Bild: verschieben per Ziehen, Größe an den Ecken. Maße in Bildpixeln. */
  import type { Crop } from '../../services/imageGen/figureFromPortrait';

  let { src, width, height, crop = $bindable(), disabled }: {
    src: string;
    width: number;
    height: number;
    crop: Crop;
    disabled: boolean;
  } = $props();

  const MIN_SIDE = 32;

  /** Welche Kanten eine Ecke mitzieht; ohne Ecke verschiebt das Ziehen den ganzen Rahmen. */
  type Corner = { left: boolean; top: boolean };
  const CORNERS: (Corner & { name: string })[] = [
    { name: 'nw', left: true, top: true }, { name: 'ne', left: false, top: true },
    { name: 'sw', left: true, top: false }, { name: 'se', left: false, top: false },
  ];

  let box = $state<HTMLDivElement>();
  let drag: { corner: Corner | null; x: number; y: number; start: Crop; scale: number } | null = null;

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  function begin(e: PointerEvent, corner: Corner | null) {
    if (disabled || !box) return;
    e.preventDefault();
    e.stopPropagation();
    drag = { corner, x: e.clientX, y: e.clientY, start: { ...crop }, scale: width / box.clientWidth };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  /** Eine Achse: die gezogene Kante wandert, die gegenüberliegende bleibt stehen. */
  function edge(pos: number, size: number, delta: number, low: boolean, limit: number): [number, number] {
    if (!low) return [pos, clamp(size + delta, MIN_SIDE, limit - pos)];
    const p = clamp(pos + delta, 0, pos + size - MIN_SIDE);
    return [p, pos + size - p];
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    e.stopPropagation();
    const s = drag.start;
    const dx = (e.clientX - drag.x) * drag.scale;
    const dy = (e.clientY - drag.y) * drag.scale;
    if (!drag.corner) {
      crop = { ...s, x: clamp(s.x + dx, 0, width - s.width), y: clamp(s.y + dy, 0, height - s.height) };
      return;
    }
    const [x, w] = edge(s.x, s.width, dx, drag.corner.left, width);
    const [y, h] = edge(s.y, s.height, dy, drag.corner.top, height);
    crop = { x, y, width: w, height: h };
  }

  const end = () => { drag = null; };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
</script>

<div class="crop" class:disabled bind:this={box}>
  <img {src} alt="Portrait" draggable="false" />
  <div class="sel" role="presentation"
    style:left={pct(crop.x, width)} style:top={pct(crop.y, height)}
    style:width={pct(crop.width, width)} style:height={pct(crop.height, height)}
    onpointerdown={(e) => begin(e, null)} onpointermove={move} onpointerup={end} onpointercancel={end}>
    {#each CORNERS as c (c.name)}
      <span class="handle {c.name}" role="presentation"
        onpointerdown={(e) => begin(e, c)} onpointermove={move} onpointerup={end} onpointercancel={end}></span>
    {/each}
  </div>
</div>

<style>
  .crop { position: relative; overflow: hidden; border-radius: 4px; user-select: none; touch-action: none; }
  .crop img { display: block; width: 100%; height: auto; pointer-events: none; }
  .sel {
    position: absolute; box-sizing: border-box; cursor: move;
    border: 2px solid var(--bg);
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.45);
  }
  .handle {
    position: absolute; width: 12px; height: 12px;
    background: var(--bg); border: 1px solid var(--ink); border-radius: 2px;
  }
  .nw { left: 0; top: 0; cursor: nwse-resize; }
  .se { right: 0; bottom: 0; cursor: nwse-resize; }
  .ne { right: 0; top: 0; cursor: nesw-resize; }
  .sw { left: 0; bottom: 0; cursor: nesw-resize; }
  .disabled .sel, .disabled .handle { cursor: default; }
</style>
