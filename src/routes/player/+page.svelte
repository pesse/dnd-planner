<script lang="ts">
  /** Spieleransicht: zeigt nur, was die SL freigibt. Doppelklick schaltet Vollbild. */
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import MapStage from '$lib/components/battleMap/MapStage.svelte';
  import { onGmMessage, sendToGm } from '$lib/services/battleMap/channel';
  import { fitRect, type Camera } from '$lib/services/battleMap/geometry';
  import type { PlayerState } from '$lib/services/battleMap/playerState';
  import { isTauri } from '$lib/services/httpFetch';

  let shown = $state<PlayerState | null>(null);
  let vw = $state(0);
  let vh = $state(0);
  let img = $state({ w: 0, h: 0 });
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

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

<div class="player" class:idle onpointermove={wake} bind:clientWidth={vw} bind:clientHeight={vh} ondblclick={toggleFullscreen} role="presentation">
  {#if shown?.imageUrl}
    <MapStage
      mode="player"
      imageUrl={shown.imageUrl}
      grid={shown.grid}
      tokens={shown.tokens}
      fog={shown.fog}
      lighting={shown.lighting}
      {camera}
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
