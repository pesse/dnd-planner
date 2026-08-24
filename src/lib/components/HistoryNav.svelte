<script lang="ts">
  import { navigateBack, navigateForward } from '$lib/services/navigation';
  import { navHistoryState } from '$lib/stores/navigationHistory';
  import { activeFile } from '$lib/stores/campaign';

  // Der Vault-Präfix steht an jedem Pfad und trägt nichts zur Unterscheidung bei.
  const shown = $derived(($activeFile?.path ?? '').replace(/^\.\/vault\//, ''));

  function onKeydown(e: KeyboardEvent) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); void navigateBack(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); void navigateForward(); }
  }

  /** Maus-Zurück/-Vor (X1/X2). `preventDefault` hält die WebView von ihrer eigenen Historie ab. */
  function onMousedown(e: MouseEvent) {
    if (e.button === 3) { e.preventDefault(); void navigateBack(); }
    else if (e.button === 4) { e.preventDefault(); void navigateForward(); }
  }
</script>

<svelte:window onkeydown={onKeydown} onmousedown={onMousedown} />

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
  {#if shown}
    <span class="path" title={$activeFile?.path}>{shown}</span>
  {/if}
</div>

<style>
  .history-nav {
    display: flex;
    align-items: center;
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

  .path {
    flex: 1;
    min-width: 0;
    margin-left: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    color: var(--ink-muted);
    opacity: 0.7;
  }
</style>
