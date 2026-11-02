<script lang="ts">
  /** Zeichnet Karte, Raster, Tokens, Licht und Nebel — für SL- und Spielerfenster gleich. */
  import type { Snippet } from 'svelte';
  import type { FogOp, Grid, Lighting } from '../../schemas/battleMap';
  import type { Camera } from '../../services/battleMap/geometry';
  import { drawFog, drawLighting } from '../../services/battleMap/overlayRender';
  import { initialsOf } from '../../services/battleMap/tokenSources';

  export interface StageToken {
    id: string;
    name: string;
    x: number;
    y: number;
    size: number;
    color: string;
    imageUrl: string;
    hidden?: boolean;
    movable?: boolean;
    hp?: number | null;
    hpMax?: number | null;
  }

  let {
    mode,
    imageUrl,
    grid,
    tokens,
    fog,
    lighting,
    camera,
    selectedId = null,
    onimagesize,
    overlay,
  }: {
    mode: 'gm' | 'player';
    imageUrl: string;
    grid: Grid;
    tokens: StageToken[];
    fog: { enabled: boolean; ops: FogOp[] };
    lighting: Lighting;
    camera: Camera;
    selectedId?: string | null;
    onimagesize?: (w: number, h: number) => void;
    overlay?: Snippet<[{ w: number; h: number }]>;
  } = $props();

  let imgW = $state(0);
  let imgH = $state(0);
  let fogCanvas = $state<HTMLCanvasElement>();
  let lightCanvas = $state<HTMLCanvasElement>();
  let brokenImages = $state<Record<string, boolean>>({});

  function onload(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    imgW = img.naturalWidth;
    imgH = img.naturalHeight;
    onimagesize?.(imgW, imgH);
  }

  $effect(() => {
    if (!fogCanvas || !imgW) return;
    drawFog(fogCanvas, fog.ops, imgW, imgH, '#0c0a10');
  });

  $effect(() => {
    if (!lightCanvas || !imgW) return;
    drawLighting(lightCanvas, lighting, grid, imgW, imgH);
  });

  const gridPath = $derived(`M ${grid.size} 0 L 0 0 0 ${grid.size}`);
  const patternId = `grid-${Math.random().toString(36).slice(2)}`;
</script>

<div
  class="layer"
  style="transform: translate({camera.tx}px, {camera.ty}px) scale({camera.zoom}); width: {imgW}px; height: {imgH}px;"
>
  {#if imageUrl}
    <img class="map-image" src={imageUrl} alt="" draggable="false" {onload} />
  {/if}

  {#if imgW && grid.visible}
    <svg class="grid" width={imgW} height={imgH} aria-hidden="true">
      <defs>
        <pattern id={patternId} width={grid.size} height={grid.size} patternUnits="userSpaceOnUse" x={grid.offsetX} y={grid.offsetY}>
          <path d={gridPath} fill="none" stroke="#000" stroke-width={Math.max(1, grid.size / 50)} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#{patternId})" opacity={grid.opacity} />
    </svg>
  {/if}

  {#each tokens as t (t.id)}
    {@const px = grid.size * t.size}
    <div
      class="token"
      class:hidden-token={t.hidden}
      class:selected={t.id === selectedId}
      class:down={t.hp === 0}
      class:grab={mode === 'gm' || t.movable}
      data-token-id={t.id}
      style="left: {grid.offsetX + t.x * grid.size}px; top: {grid.offsetY + t.y * grid.size}px; width: {px}px; height: {px}px; --tc: {t.color}; --tb: {Math.max(2, px / 22)}px;"
      title={t.name}
    >
      {#if t.imageUrl && !brokenImages[t.id]}
        <img src={t.imageUrl} alt="" draggable="false" onerror={() => (brokenImages[t.id] = true)} />
      {:else}
        <span class="initials" style="font-size: {px * 0.36}px">{initialsOf(t.name)}</span>
      {/if}
      {#if mode === 'gm' && t.hpMax && t.hp != null && t.hp < t.hpMax}
        <span class="hp-bar" style="height: {Math.max(4, px / 12)}px"><span style="width: {(100 * t.hp) / t.hpMax}%"></span></span>
      {/if}
      <span class="label" style="font-size: {Math.max(10, grid.size * 0.2)}px">{t.name}</span>
    </div>
  {/each}

  <canvas class="overlay" class:gm={mode === 'gm'} bind:this={lightCanvas}></canvas>
  {#if fog.enabled}
    <canvas class="overlay fog" class:gm={mode === 'gm'} bind:this={fogCanvas}></canvas>
  {/if}

  {#if overlay && imgW}
    {@render overlay({ w: imgW, h: imgH })}
  {/if}
</div>

<style>
  .layer {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  .map-image {
    display: block;
    user-select: none;
  }
  .grid,
  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .overlay.gm {
    opacity: 0.5;
  }
  .overlay.fog.gm {
    opacity: 0.55;
  }
  .token {
    position: absolute;
    border-radius: 50%;
    border: var(--tb) solid var(--tc);
    background: var(--tc);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .token.grab {
    cursor: grab;
  }
  .token img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    object-position: 50% 15%;
    pointer-events: none;
  }
  .initials {
    color: #fff;
    font-weight: 700;
    pointer-events: none;
  }
  .label {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 2px;
    padding: 0 0.3em;
    white-space: nowrap;
    color: #fff;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 3px;
    pointer-events: none;
  }
  .token.hidden-token {
    opacity: 0.45;
    border-style: dashed;
  }
  .token.down {
    border-color: #555;
    background: #333;
  }
  .token.down img,
  .token.down .initials {
    filter: grayscale(1) brightness(0.6);
  }
  .token.down::after {
    content: '✕';
    position: absolute;
    color: #c0281a;
    font-size: calc(var(--tb) * 14);
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
  }
  .hp-bar {
    position: absolute;
    bottom: 100%;
    left: 10%;
    width: 80%;
    margin-bottom: 2px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 2px;
    overflow: hidden;
    pointer-events: none;
  }
  .hp-bar span {
    display: block;
    height: 100%;
    background: #d23a26;
  }
  .token.selected {
    outline: calc(var(--tb) * 1.2) solid #ffd36b;
    outline-offset: 2px;
  }
</style>
