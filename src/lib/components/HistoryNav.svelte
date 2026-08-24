<script lang="ts">
  import { navigateBack, navigateForward } from '$lib/services/navigation';
  import { navHistoryState } from '$lib/stores/navigationHistory';

  function onKeydown(e: KeyboardEvent) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); void navigateBack(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); void navigateForward(); }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="history-nav">
  <button
    onclick={() => navigateBack()}
    disabled={!$navHistoryState.canBack}
    title="Zurück (Alt+←)"
    aria-label="Zurück"
  >←</button>
  <button
    onclick={() => navigateForward()}
    disabled={!$navHistoryState.canForward}
    title="Vor (Alt+→)"
    aria-label="Vor"
  >→</button>
</div>

<style>
  .history-nav {
    display: flex;
    gap: 0.15rem;
    padding: 0.25rem 1rem;
    background: var(--bg-panel);
    flex-shrink: 0;
  }

  .history-nav button {
    background: none;
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    padding: 0.15rem 0.6rem;
  }

  .history-nav button:hover:not(:disabled) {
    color: var(--red);
    border-color: var(--red);
  }

  .history-nav button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
