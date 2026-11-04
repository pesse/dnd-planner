<script lang="ts">
  /** Rahmen der Schwebe-Tooltips im Stil von `ItemTooltip`: folgt dem Cursor, klappt am Fensterrand um. */
  import type { Snippet } from 'svelte';
  import { tipWheel } from '../../utils/tipWheel';

  let { x, y, content, children }: { x: number; y: number; content: unknown; children: Snippet } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

<div class="tooltip-frame" data-no-dice-refs style="left:{left}px;top:{top}px" bind:clientWidth={boxW} bind:clientHeight={boxH} use:tipWheel={content}>
  {@render children()}
</div>

<style>
  .tooltip-frame {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 200px;
    width: max-content;
    max-width: 320px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }
  .tooltip-frame :global(.tt-head) {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
  }
  .tooltip-frame :global(.tt-title) { flex: 1; min-width: 0; }
  .tooltip-frame :global(.tt-name) {
    font-weight: 600;
    font-size: 0.88rem;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.2rem;
  }
  .tooltip-frame :global(.tt-name-en) {
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-weight: 400;
    font-style: italic;
  }
  .tooltip-frame :global(.tt-meta) {
    font-size: 0.74rem;
    color: var(--red);
    margin-bottom: 0.45rem;
  }
  .tooltip-frame :global(.tt-section) {
    display: flex;
    gap: 0.5rem;
    font-size: 0.78rem;
    margin-bottom: 0.15rem;
    align-items: baseline;
  }
  .tooltip-frame :global(.tt-label) {
    color: var(--ink-muted);
    flex-shrink: 0;
    min-width: 70px;
    font-size: 0.72rem;
  }
  .tooltip-frame :global(.tt-divider) { border-top: 1px solid var(--surface); margin: 0.45rem 0; }
</style>
