<script lang="ts">
  /** Zeichnet Karte, Raster, Tokens, Licht und Nebel — für SL- und Spielerfenster gleich. */
  import type { Snippet } from 'svelte';
  import type { FogOp, Grid, Lighting, Token } from '../../schemas/battleMap';
  import type { Camera } from '../../services/battleMap/geometry';
  import { drawFog, drawLighting, flickerLights, tokenLights, type LightSpot } from '../../services/battleMap/overlayRender';
  import { initialsOf, shortName } from '../../services/battleMap/tokenSources';
  import { isBloodied } from '../../services/battleMap/tokenDetails';
  import { badgeIconUrl } from '../../conditionIcon';
  import EyeIcon from '../ui/EyeIcon.svelte';
  import { textTip } from '../textTip.svelte';
  import type { HpPop } from '../../services/battleMap/hpPops.svelte';
  import type { PlacedImage } from '../../services/battleMap/levels';

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
    bloodied?: boolean;
    hp?: number | null;
    hpMax?: number | null;
    conditions?: Token['conditions'];
    effects?: Token['effects'];
    light?: Token['light'];
  }

  let {
    mode,
    image,
    underlay = null,
    frame,
    grid,
    tokens,
    fog,
    lighting,
    camera,
    selectedId = null,
    turnId = '',
    pops = [],
    tips,
    overlay,
  }: {
    mode: 'gm' | 'player';
    image: PlacedImage;
    /** Die Ebene darunter, abgedunkelt — sie scheint durch transparente Stellen von `image`. */
    underlay?: PlacedImage | null;
    /** Format der Grundebene; Nebel, Licht und Raster spannen sich darüber. */
    frame: { w: number; h: number };
    grid: Grid;
    tokens: StageToken[];
    fog: { enabled: boolean; ops: FogOp[] };
    lighting: Lighting;
    camera: Camera;
    selectedId?: string | null;
    turnId?: string;
    pops?: HpPop[];
    /** Nur im Spielerfenster: Regeltexte für Zustände, Effekte und `bloodied`. */
    tips?: Record<string, string>;
    overlay?: Snippet<[{ w: number; h: number }]>;
  } = $props();

  const imgW = $derived(frame.w);
  const imgH = $derived(frame.h);
  let fogCanvas = $state<HTMLCanvasElement>();
  let lightCanvas = $state<HTMLCanvasElement>();
  let brokenImages = $state<Record<string, boolean>>({});

  $effect(() => {
    if (!fogCanvas || !imgW) return;
    drawFog(fogCanvas, fog.ops, imgW, imgH, '#0c0a10');
  });

  const lights = $derived([...lighting.lights, ...tokenLights(tokens, grid)]);
  const flickers = $derived(
    mode === 'player' && lights.length > 0 && lighting.darkness > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const drawLights = (canvas: HTMLCanvasElement, spots: LightSpot[]) =>
    drawLighting(canvas, { darkness: lighting.darkness, lights: spots }, grid, imgW, imgH);

  $effect(() => {
    if (!lightCanvas || !imgW || flickers) return;
    drawLights(lightCanvas, lights);
  });

  // Die Schleife liest pro Bild den aktuellen Stand — hinge sie an `lights`, startete jeder Zug-Schritt sie neu.
  $effect(() => {
    const canvas = lightCanvas;
    if (!canvas || !flickers) return;
    let frame = requestAnimationFrame(function tick(now) {
      if (imgW) drawLights(canvas, flickerLights(lights, now / 1000));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  const gridPath = $derived(`M ${grid.size} 0 L 0 0 0 ${grid.size}`);
  const patternId = `grid-${Math.random().toString(36).slice(2)}`;
</script>

<div
  class="layer"
  style="transform: translate({camera.tx}px, {camera.ty}px) scale({camera.zoom}); width: {imgW}px; height: {imgH}px;"
>
  {#if underlay?.url}
    <img class="map-image underlay" src={underlay.url} alt="" draggable="false" style="left: {underlay.x}px; top: {underlay.y}px" />
  {/if}
  {#if image.url}
    <img class="map-image" src={image.url} alt="" draggable="false" style="left: {image.x}px; top: {image.y}px" />
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
    {@const badges = [...(t.effects ?? []), ...(t.conditions ?? [])]}
    {@const bloodied = t.bloodied || isBloodied({ hp: t.hp ?? null, hpMax: t.hpMax ?? null })}
    <div
      class="token"
      class:hidden-token={t.hidden}
      class:selected={t.id === selectedId}
      class:down={t.down || t.hp === 0}
      class:bloodied
      class:turn={t.id === turnId}
      class:grab={mode === 'gm' || t.movable}
      data-token-id={t.id}
      style="left: {grid.offsetX + t.x * grid.size}px; top: {grid.offsetY + t.y * grid.size}px; width: {px}px; height: {px}px; --tc: {t.color}; --tb: {Math.max(2, px / 22)}px;"
      title={tips ? undefined : t.name}
    >
      {#if t.imageUrl && !brokenImages[t.id]}
        <img src={t.imageUrl} alt="" draggable="false" onerror={() => (brokenImages[t.id] = true)} />
      {:else}
        <span class="initials" style="font-size: {px * 0.36}px">{initialsOf(t.name)}</span>
      {/if}
      {#if t.hidden}<span class="hidden-badge" style="font-size: calc(var(--tb) * 5)"><EyeIcon closed /></span>{/if}
      {#if mode === 'gm' && t.hpMax && t.hp != null && t.hp < t.hpMax}
        <span class="hp-bar" style="height: {Math.max(4, px / 12)}px"><span style="width: {(100 * t.hp) / t.hpMax}%"></span></span>
      {/if}
      {#if badges.length}
        <span class="conditions" class:tips={!!tips} style="--ci: {Math.max(12, grid.size * 0.3)}px">
          {#each badges as b}<img src={badgeIconUrl(b)} alt="" draggable="false" use:textTip={tips?.[b]} />{/each}
        </span>
      {/if}
      {#if bloodied}<span class="blood" class:tips={!!tips} use:textTip={tips?.bloodied}></span>{/if}
      {#each pops.filter((p) => p.tokenId === t.id) as p, i (p.key)}
        <span class="pop" class:heal={p.delta > 0} style="font-size: {Math.max(14, px * 0.38)}px; margin-top: {-i * 1.05}em">{p.delta > 0 ? '+' : '−'}{Math.abs(p.delta)}</span>
      {/each}
      <span class="label" style="font-size: {Math.max(9, grid.size * 0.14)}px">{shortName(t.name)}</span>
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
    position: absolute;
    display: block;
    max-width: none;
    user-select: none;
  }
  .map-image.underlay {
    filter: brightness(0.45) saturate(0.6);
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
    margin-top: 1px;
    padding: 0 0.3em;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.4);
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
  .hidden-badge {
    position: absolute;
    top: -0.25em;
    left: -0.25em;
    z-index: 2;
    display: flex;
    padding: 0.12em;
    line-height: 1;
    color: #f3e6c8;
    background: rgba(20, 12, 8, 0.8);
    border-radius: 50%;
    pointer-events: none;
  }
  .token.bloodied {
    border-color: #a3140c;
  }
  .token.bloodied img {
    filter: sepia(0.6) saturate(2.2) hue-rotate(-25deg);
  }
  .blood {
    position: absolute;
    z-index: 3;
    right: 2%;
    bottom: 2%;
    width: calc(var(--tb) * 3.6);
    height: calc(var(--tb) * 3.6);
    background: radial-gradient(circle at 35% 35%, #d6352a, #7a0904 70%);
    border: 1px solid #3a0402;
    border-radius: 0 50% 50% 50%;
    transform: rotate(45deg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
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
    left: 82%;
    top: -4%;
    display: flex;
    flex-direction: column;
    gap: 1px;
    z-index: 3;
    pointer-events: none;
  }
  .tips,
  .tips img {
    pointer-events: auto;
  }
  .conditions img {
    width: var(--ci);
    height: var(--ci);
    border-radius: 50%;
    background: rgba(20, 12, 8, 0.75);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
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
