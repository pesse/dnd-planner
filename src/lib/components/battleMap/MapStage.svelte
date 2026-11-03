<script lang="ts">
  /** Zeichnet Karte, Raster, Tokens, Licht und Nebel — für SL- und Spielerfenster gleich. */
  import type { Snippet } from 'svelte';
  import type { FogOp, Grid, Lighting } from '../../schemas/battleMap';
  import type { Camera } from '../../services/battleMap/geometry';
  import { drawFog, drawLighting } from '../../services/battleMap/overlayRender';
  import { initialsOf } from '../../services/battleMap/tokenSources';
  import { CONDITIONS, type Condition } from '../../schemas/vocabulary';
  import type { HpPop } from '../../services/battleMap/hpPops.svelte';

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
    down?: boolean;
    hp?: number | null;
    hpMax?: number | null;
    conditions?: Condition[];
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
    turnId = '',
    pops = [],
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
    turnId?: string;
    pops?: HpPop[];
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
      class:down={t.down || t.hp === 0}
      class:turn={t.id === turnId}
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
      {#if t.conditions?.length}
        <span class="conditions" style="font-size: {Math.max(9, grid.size * 0.16)}px">
          {#each t.conditions as c}<span>{CONDITIONS[c]}</span>{/each}
        </span>
      {/if}
      {#each pops.filter((p) => p.tokenId === t.id) as p, i (p.key)}
        <span class="pop" class:heal={p.delta > 0} style="font-size: {Math.max(14, px * 0.38)}px; margin-top: {-i * 1.05}em">{p.delta > 0 ? '+' : '−'}{Math.abs(p.delta)}</span>
      {/each}
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
    opacity: 0.8;
    border-style: dashed;
  }
  .token.hidden-token img,
  .token.hidden-token .initials {
    filter: saturate(0.4);
  }
  .token.hidden-token::before {
    content: '🙈';
    position: absolute;
    top: -0.2em;
    left: -0.2em;
    font-size: calc(var(--tb) * 6);
    line-height: 1;
    z-index: 2;
    pointer-events: none;
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
  .token.turn {
    box-shadow:
      0 0 0 calc(var(--tb) * 1.2) #6fd3ff,
      0 0 calc(var(--tb) * 8) #6fd3ff;
  }
  .conditions {
    position: absolute;
    left: 88%;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    z-index: 3;
    pointer-events: none;
  }
  .conditions span {
    padding: 0 0.35em;
    white-space: nowrap;
    color: #fff;
    background: rgba(90, 30, 110, 0.85);
    border-radius: 0.6em;
  }
  .pop {
    position: absolute;
    top: 10%;
    left: 50%;
    z-index: 4;
    font-weight: 800;
    color: #ff5a45;
    text-shadow:
      0 0 3px #000,
      0 2px 4px #000;
    pointer-events: none;
    animation: pop 6s ease-out forwards;
  }
  .pop.heal {
    color: #7dff7a;
  }
  @keyframes pop {
    0% {
      opacity: 0;
      transform: translate(-50%, 20%) scale(0.6);
    }
    5% {
      opacity: 1;
      transform: translate(-50%, -60%) scale(1.15);
    }
    10% {
      transform: translate(-50%, -60%) scale(1);
    }
    85% {
      opacity: 1;
      transform: translate(-50%, -60%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -120%) scale(1);
    }
  }
  .token.selected {
    z-index: 2;
    outline: calc(var(--tb) * 1.2) solid #ffd36b;
    outline-offset: 2px;
  }
</style>
