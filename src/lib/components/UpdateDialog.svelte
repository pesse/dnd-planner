<script lang="ts">
  import { updateState, updateDialogOpen, installUpdate, dismissUpdate } from '$lib/stores/update';

  const busy = $derived($updateState.status === 'downloading' || $updateState.status === 'installing');
  const pct = $derived(Math.round(($updateState.progress ?? 0) * 100));

  function onKey(e: KeyboardEvent) {
    if (!$updateDialogOpen) return;
    if (e.key === 'Escape' && !busy) dismissUpdate();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $updateDialogOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="overlay" onclick={() => { if (!busy) dismissUpdate(); }}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>Update verfügbar{$updateState.version ? ` — v${$updateState.version}` : ''}</h3>

      {#if $updateState.notes}
        <pre class="notes">{$updateState.notes}</pre>
      {:else}
        <p>Eine neuere Version steht bereit.</p>
      {/if}

      {#if busy}
        <div class="progress">
          <div class="bar" style="width: {pct}%"></div>
        </div>
        <p class="status">
          {$updateState.status === 'installing' ? 'Installieren & Neustart…' : `Wird heruntergeladen… ${pct}%`}
        </p>
      {/if}

      <div class="actions">
        <button class="cancel-btn" disabled={busy} onclick={() => dismissUpdate()}>Später</button>
        <button class="ok-btn" disabled={busy} onclick={() => installUpdate()}>Jetzt aktualisieren</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: var(--bg-raised);
    border: 1px solid var(--gold);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    max-width: 460px;
    width: 90%;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    color: var(--ink);
  }

  .dialog h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: var(--gold);
  }

  .dialog p {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  .notes {
    margin: 0 0 1.25rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 220px;
    overflow-y: auto;
    font-family: inherit;
  }

  .progress {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }
  .bar {
    height: 100%;
    background: var(--green);
    transition: width 0.15s ease-out;
  }
  .status {
    margin: 0 0 1rem;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .actions button {
    border-radius: 4px;
    padding: 0.35rem 0.9rem;
    cursor: pointer;
    font-size: 0.82rem;
    font-family: inherit;
  }
  .actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .ok-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    font-weight: 600;
  }
  .ok-btn:not(:disabled):hover { filter: brightness(1.1); }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
  }
  .cancel-btn:not(:disabled):hover { color: var(--ink); }
</style>
