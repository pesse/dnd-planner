<script lang="ts">
  import { confirmPrompt } from '$lib/stores/confirmDialog';

  function choose(ok: boolean) {
    $confirmPrompt?.resolve(ok);
  }

  function onKey(e: KeyboardEvent) {
    if (!$confirmPrompt) return;
    // Bewusst KEIN Enter→Bestätigen: vermeidet versehentliches Löschen.
    if (e.key === 'Escape') choose(false);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $confirmPrompt}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="overlay" onclick={() => choose(false)}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>{$confirmPrompt.title}</h3>
      <p>{$confirmPrompt.message}</p>
      <div class="actions">
        <button class="cancel-btn" onclick={() => choose(false)}>Abbrechen</button>
        <button class:danger-btn={$confirmPrompt.danger} class:ok-btn={!$confirmPrompt.danger} onclick={() => choose(true)}>
          {$confirmPrompt.confirmLabel}
        </button>
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
    border: 1px solid var(--red);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    color: var(--ink);
  }

  .dialog h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: var(--gold);
  }

  .dialog p {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    color: var(--ink-muted);
    line-height: 1.5;
    white-space: pre-line;
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

  .danger-btn {
    background: var(--danger);
    color: var(--bg);
    border: none;
    font-weight: 600;
  }
  .danger-btn:hover { filter: brightness(1.1); }

  .ok-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    font-weight: 600;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
  }
  .cancel-btn:hover { color: var(--ink); }
</style>
