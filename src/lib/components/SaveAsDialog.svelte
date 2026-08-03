<script lang="ts">
  import { saveAsPrompt } from '$lib/editor/saveAs';
  import PromptDialog from './ui/PromptDialog.svelte';

  let name = $state('');
  let bucket = $state<string | undefined>(undefined);

  // Felder bei jedem neuen Request initialisieren
  $effect(() => {
    const req = $saveAsPrompt;
    if (req) {
      name = req.name;
      bucket = req.bucket ?? req.buckets[0]?.value;
    }
  });

  function confirm() {
    if (!$saveAsPrompt || !name.trim()) return;
    $saveAsPrompt.resolve({ name: name.trim(), bucket });
  }

  function cancel() {
    $saveAsPrompt?.resolve(null);
  }

  function onKey(e: KeyboardEvent) {
    if (!$saveAsPrompt) return;
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter') confirm();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $saveAsPrompt}
  <PromptDialog title="Speichern unter" accent="var(--gold)" titleGap="1rem" onbackdrop={cancel}>
    <label class="field">
      <span>Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} autofocus spellcheck="false" />
    </label>

    {#if $saveAsPrompt.bucketLabel}
      <label class="field">
        <span>{$saveAsPrompt.bucketLabel}</span>
        <select bind:value={bucket}>
          {#each $saveAsPrompt.buckets as b}
            <option value={b.value}>{b.label}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#snippet actions()}
      <button class="cancel-btn" onclick={cancel}>Abbrechen</button>
      <button class="ok-btn" onclick={confirm} disabled={!name.trim()}>Speichern</button>
    {/snippet}
  </PromptDialog>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.85rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .field:last-of-type { margin-bottom: 1.1rem; }

  .field input,
  .field select {
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.4rem 0.55rem;
    font-size: 0.85rem;
    font-family: inherit;
    outline: none;
  }
  .field input:focus,
  .field select:focus { border-color: var(--gold); }

  .ok-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .cancel-btn:hover { color: var(--ink); }
</style>
