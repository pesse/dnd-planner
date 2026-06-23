<script lang="ts">
  import { saveAsPrompt } from '$lib/editor/saveAs';

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
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="overlay" onclick={cancel}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>Speichern unter</h3>

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

      <div class="actions">
        <button class="cancel-btn" onclick={cancel}>Abbrechen</button>
        <button class="save-btn" onclick={confirm} disabled={!name.trim()}>Speichern</button>
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
    max-width: 420px;
    width: 90%;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    color: var(--ink);
  }

  .dialog h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    color: var(--gold);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.85rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }

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

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
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
  .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
  }
  .cancel-btn:hover { color: var(--ink); }
</style>
