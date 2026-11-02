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

  const camera = $derived.by((): Camera => {
    if (!shown || !img.w || !vw) return { zoom: 1, tx: 0, ty: 0 };
    return fitRect(shown.view ?? { x: 0, y: 0, w: img.w, h: img.h }, vw, vh);
  });

  // Jede Größenänderung melden — der SL-Rahmen zeigt sonst ein falsches Seitenverhältnis.
  $effect(() => {
    if (vw && vh) sendToGm({ type: 'viewport', w: vw, h: vh });
  });

  onMount(() => {
    const unlisten = onGmMessage((msg) => {
      if (msg.type === 'state') {
        if (msg.state.imageUrl !== shown?.imageUrl) img = { w: 0, h: 0 };
        shown = msg.state;
      }
    });
    sendToGm({ type: 'hello' });
    const bye = () => sendToGm({ type: 'bye' });
    window.addEventListener('beforeunload', bye);
    return () => {
      unlisten();
      bye();
      window.removeEventListener('beforeunload', bye);
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

<div class="player" bind:clientWidth={vw} bind:clientHeight={vh} ondblclick={toggleFullscreen} role="presentation">
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
    cursor: default;
  }
</style>
