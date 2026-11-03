<script lang="ts">
  /** Angeheftete Tooltips als verschiebbare Fenster über dem Cockpit. */
  import Markdown from '../../Markdown.svelte';
  import { pinnedTips, unpinTip, type PinnedTip } from '../../../services/battleMap/pinnedTips.svelte';

  let drag: { tip: PinnedTip; dx: number; dy: number } | null = null;

  function grab(e: PointerEvent, tip: PinnedTip) {
    if ((e.target as HTMLElement).closest('button')) return;
    drag = { tip, dx: e.clientX - tip.x, dy: e.clientY - tip.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    drag.tip.x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - drag.dx));
    drag.tip.y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - drag.dy));
  }
</script>

{#each pinnedTips.list as tip (tip.id)}
  <section class="pinned" style="left: {tip.x}px; top: {tip.y}px" aria-label="Angehefteter Regeltext">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header onpointerdown={(e) => grab(e, tip)} onpointermove={move} onpointerup={() => (drag = null)}>
      <button title="Schließen" onclick={() => unpinTip(tip.id)}>✕</button>
    </header>
    <div class="body"><Markdown source={tip.text} /></div>
  </section>
{/each}

<style>
  .pinned {
    position: fixed;
    z-index: 9000;
    width: max-content;
    max-width: 300px;
    background: var(--bg-panel);
    color: var(--ink);
    border: 1px solid var(--border);
    border-left: 3px solid var(--gold);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(20, 12, 2, 0.45);
    font-size: 0.8rem;
  }
  header {
    display: flex;
    justify-content: flex-end;
    height: 1.3rem;
    background: var(--surface);
    border-radius: 0 5px 0 0;
    cursor: move;
    touch-action: none;
  }
  header button {
    padding: 0 0.45rem;
    background: none;
    border: none;
    color: var(--ink-muted);
    font-size: 0.75rem;
    cursor: pointer;
  }
  header button:hover {
    color: var(--red);
  }
  .body {
    max-height: 50vh;
    overflow-y: auto;
    padding: 0.35rem 0.6rem 0.45rem;
  }
</style>
