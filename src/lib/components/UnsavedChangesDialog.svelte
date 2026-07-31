<script lang="ts">
  import { unsavedPrompt } from '$lib/stores/navigationGuard';
  import PromptDialog from './ui/PromptDialog.svelte';

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
  <PromptDialog title="Ungespeicherte Änderungen" onbackdrop={() => choose('cancel')}>
    <p>Diese Karte hat ungespeicherte Änderungen. Vor dem Wechsel speichern oder verwerfen?</p>
    {#snippet actions()}
      <button class="cancel-btn" onclick={() => choose('cancel')}>Abbrechen</button>
      <button class="discard-btn" onclick={() => choose('discard')}>Verwerfen</button>
      <button class="save-btn" onclick={() => choose('save')}>Speichern</button>
    {/snippet}
  </PromptDialog>
{/if}

<style>
  p {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    color: var(--ink-muted);
    line-height: 1.5;
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
