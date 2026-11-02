<script lang="ts">
  /** Spieleransicht: zeigt nur, was die SL freigibt; Charaktere lassen sich ziehen. Doppelklick schaltet Vollbild. */
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import MapStage from '$lib/components/battleMap/MapStage.svelte';
  import { onGmMessage, sendToGm } from '$lib/services/battleMap/channel';
  import { fitRect, pxToCell, snapCell, toImage, type Camera, type Point } from '$lib/services/battleMap/geometry';
  import { clampToView, type PlayerState } from '$lib/services/battleMap/playerState';
  import { isTauri } from '$lib/services/httpFetch';

  let shown = $state<PlayerState | null>(null);
  let vw = $state(0);
  let vh = $state(0);
  let img = $state({ w: 0, h: 0 });
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let drag = $state<{ id: string; grab: Point; at: Point } | null>(null);

  function wake() {
    idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (idle = true), 2000);
  }

  const view = $derived(shown?.view ?? { x: 0, y: 0, w: img.w, h: img.h });
  const camera = $derived.by((): Camera => {
    if (!shown || !img.w || !vw) return { zoom: 1, tx: 0, ty: 0 };
    return fitRect(view, vw, vh);
  });

  // Bis zum Loslassen gilt die eigene Position — das Echo der SL hinkt einen Frame hinterher.
  const tokens = $derived(
    (shown?.tokens ?? []).map((t) => (drag?.id === t.id ? { ...t, ...drag.at } : t)),
  );

  const cellAt = (e: PointerEvent) => pxToCell(shown!.grid, toImage(camera, { x: e.clientX, y: e.clientY }));

  function onpointerdown(e: PointerEvent) {
    e.preventDefault();
    const id = (e.target as Element).closest<HTMLElement>('[data-token-id]')?.dataset.tokenId;
    const t = shown?.tokens.find((x) => x.id === id);
    if (!t?.movable || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const c = cellAt(e);
    drag = { id: t.id, grab: { x: c.x - t.x, y: c.y - t.y }, at: { x: t.x, y: t.y } };
  }

  function onpointermove(e: PointerEvent) {
    wake();
    if (!drag || !shown) return;
    const t = shown.tokens.find((x) => x.id === drag!.id);
    if (!t) return;
    const c = cellAt(e);
    drag.at = clampToView(shown.grid, view, t.size, { x: c.x - drag.grab.x, y: c.y - drag.grab.y });
    sendToGm({ type: 'move', id: t.id, ...drag.at, done: false });
  }

  function onpointerup() {
    const d = drag;
    drag = null;
    const t = d && shown?.tokens.find((x) => x.id === d.id);
    if (!d || !t) return;
    const x = snapCell(d.at.x, t.size);
    const y = snapCell(d.at.y, t.size);
    t.x = x;
    t.y = y;
    sendToGm({ type: 'move', id: d.id, x, y, done: true });
  }

  onMount(() => {
    const unlisten = onGmMessage((msg) => {
      if (msg.type === 'state') {
        if (msg.state.imageUrl !== shown?.imageUrl) img = { w: 0, h: 0 };
        shown = msg.state;
      }
    });
    sendToGm({ type: 'hello' });
    return () => {
      unlisten();
      clearTimeout(idleTimer);
    };
  });

  async function toggleFullscreen() {
    if (isTauri()) {
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }
</script>

<svelte:head><title>Spieleransicht</title></svelte:head>

<div
  class="player"
  class:idle
  class:dragging={drag}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  bind:clientWidth={vw} bind:clientHeight={vh} ondblclick={toggleFullscreen} role="presentation">
  {#if shown?.imageUrl}
    <MapStage
      mode="player"
      imageUrl={shown.imageUrl}
      grid={shown.grid}
      {tokens}
      fog={shown.fog}
      lighting={shown.lighting}
      {camera}
      turnId={shown.turn}
      onimagesize={(w, h) => (img = { w, h })}
    />
    {#if img.w}
      <!-- Was neben dem Ausschnitt noch ins Fenster passt, bleibt den Spielern verborgen. -->
      <div
        class="mask"
        style:left="{camera.tx + view.x * camera.zoom}px"
        style:top="{camera.ty + view.y * camera.zoom}px"
        style:width="{view.w * camera.zoom}px"
        style:height="{view.h * camera.zoom}px"
      ></div>
    {/if}
  {:else}
    <p class="waiting">Warte auf die Spielleitung…</p>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #000;
  }
  .player {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #000;
    user-select: none;
    touch-action: none;
  }
  .player.dragging {
    cursor: grabbing;
  }
  .mask {
    position: absolute;
    box-shadow: 0 0 0 200vmax #000;
    pointer-events: none;
  }
  .player.idle {
    cursor: none;
  }
  .waiting {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    color: #8a7a5a;
    font-family: var(--font-display);
    font-size: 1.5rem;
  }
</style>
