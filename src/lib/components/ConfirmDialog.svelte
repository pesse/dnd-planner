<script lang="ts">
  import { confirmPrompt } from '$lib/stores/confirmDialog';
  import PromptDialog from './ui/PromptDialog.svelte';

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
  <PromptDialog title={$confirmPrompt.title} onbackdrop={() => choose(false)}>
    <p>{$confirmPrompt.message}</p>
    {#snippet actions()}
      <button class="cancel-btn" onclick={() => choose(false)}>Abbrechen</button>
      <button
        class:danger-btn={$confirmPrompt?.danger}
        class:ok-btn={!$confirmPrompt?.danger}
        onclick={() => choose(true)}
      >
        {$confirmPrompt?.confirmLabel}
      </button>
    {/snippet}
  </PromptDialog>
{/if}

<style>
  p {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    color: var(--ink-muted);
    line-height: 1.5;
    white-space: pre-line;
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

  .cancel-btn:hover { color: var(--ink); }
</style>
