<script lang="ts">
  /**
   * Schwebe-Tooltip für Regeltext ohne eigene Struktur — Optionshilfen der Picker.
   * Anker ist x/y (Cursor + Offset), am rechten/unteren Viewport-Rand klappt die Box um.
   */
  import Markdown from './Markdown.svelte';

  let { text, x, y }: { text: string | null; x: number; y: number } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if text}
  <div class="text-tooltip" style="left:{left}px;top:{top}px" bind:clientWidth={boxW} bind:clientHeight={boxH}>
    <Markdown source={text} />
  </div>
{/if}

<style>
  .text-tooltip {
    position: fixed; z-index: 9999; pointer-events: none;
    background: var(--bg-panel); color: var(--ink);
    border: 1px solid var(--border); border-left: 3px solid var(--gold);
    border-radius: 6px; padding: 0.45rem 0.6rem; max-width: 300px;
    box-shadow: 0 8px 24px rgba(20, 12, 2, 0.45); font-size: 0.8rem;
  }
</style>
