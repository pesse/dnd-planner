<script lang="ts">
  import type { FeatEntry } from '../featsLibrary';
  import FeatDetail from './FeatDetail.svelte';

  let { feat, x, y }: { feat: FeatEntry | null; x: number; y: number } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  // Positionierung wie beim Zauber-Tooltip: x/y ist der Anker (Cursor + Offset),
  // am rechten/unteren Viewport-Rand wird umgeklappt bzw. begrenzt.
  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if feat}
  <div class="feat-tooltip" style="left:{left}px;top:{top}px" bind:clientWidth={boxW} bind:clientHeight={boxH}>
    <FeatDetail {feat} />
  </div>
{/if}

<style>
  .feat-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--gold);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 220px;
    max-width: 360px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }
</style>
