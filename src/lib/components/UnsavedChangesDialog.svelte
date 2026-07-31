<script lang="ts">
  import { unsavedPrompt } from '$lib/stores/navigationGuard';

  function choose(choice: 'save' | 'discard' | 'cancel') {
    $unsavedPrompt?.resolve(choice);
  }

  function onKey(e: KeyboardEvent) {
    if (!$unsavedPrompt) return;
    if (e.key === 'Escape') choose('cancel');
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $unsavedPrompt}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="overlay" onclick={() => choose('cancel')}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>Ungespeicherte Änderungen</h3>
      <p>Diese Karte hat ungespeicherte Änderungen. Vor dem Wechsel speichern oder verwerfen?</p>
      <div class="actions">
        <button class="cancel-btn" onclick={() => choose('cancel')}>Abbrechen</button>
        <button class="discard-btn" onclick={() => choose('discard')}>Verwerfen</button>
        <button class="save-btn" onclick={() => choose('save')}>Speichern</button>
      </div>
    </div>
  </div>
{/if}

<style>

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

  .save-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    font-weight: 600;
  }

  .discard-btn {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger);
  }
  .discard-btn:hover { background: var(--danger); color: var(--bg); }

  .cancel-btn:hover { color: var(--ink); }
</style>
