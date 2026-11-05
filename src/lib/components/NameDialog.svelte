<script lang="ts">
  import { namePrompt } from '$lib/stores/nameDialog';
  import PromptDialog from './ui/PromptDialog.svelte';

  let name = $state('');

  $effect(() => {
    if ($namePrompt) name = '';
  });

  function confirm() {
    if ($namePrompt && name.trim()) $namePrompt.resolve(name.trim());
  }

  function cancel() {
    $namePrompt?.resolve(null);
  }

  function onKey(e: KeyboardEvent) {
    if (!$namePrompt) return;
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter') confirm();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $namePrompt}
  <PromptDialog title={$namePrompt.title} accent="var(--gold)" titleGap="1rem" onbackdrop={cancel}>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={name} placeholder={$namePrompt.placeholder} aria-label="Name" autofocus spellcheck="false" />
    {#snippet actions()}
      <button class="cancel-btn" onclick={cancel}>Abbrechen</button>
      <button class="ok-btn" onclick={confirm} disabled={!name.trim()}>{$namePrompt?.confirmLabel}</button>
    {/snippet}
  </PromptDialog>
{/if}

<style>
  input {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 1.1rem;
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.4rem 0.55rem;
    font-size: 0.85rem;
    font-family: inherit;
    outline: none;
  }
  input:focus { border-color: var(--gold); }

  .ok-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .cancel-btn:hover { color: var(--ink); }
</style>
