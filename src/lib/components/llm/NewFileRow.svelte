<script lang="ts">
  /** Pfadfeld plus Speichern-Knopf, mit dem eine Antwort in eine neue Vault-Datei geht. */
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

  let {
    path = $bindable(''),
    status = 'idle',
    placeholder = './vault/campaigns/.../neue-datei.md',
    inset = false,
    onsave,
  }: {
    path: string;
    status?: SaveStatus;
    placeholder?: string;
    /** Sitzt im Rahmen eines Code-Blocks statt frei unter der Antwort. */
    inset?: boolean;
    onsave: () => void;
  } = $props();
</script>

<div class="new-file-row" class:inset>
  <input class="new-file-input" bind:value={path} {placeholder} />
  <button class="new-file-save-btn" disabled={status === 'saving' || !path?.trim()} onclick={onsave}>
    {status === 'saving' ? '…' : status === 'saved' ? '✓' : status === 'error' ? '✕' : 'Speichern'}
  </button>
</div>

<style>
  .new-file-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }

  .new-file-row.inset {
    gap: 0.3rem;
    margin-top: 0;
    padding: 0.3rem 0.5rem;
    background: var(--bg);
    border-top: 1px solid var(--surface);
  }

  .new-file-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font-size: 0.7rem;
    font-family: monospace;
    outline: none;
    min-width: 0;
  }

  .new-file-input:focus { border-color: var(--red); }

  .new-file-save-btn {
    background: var(--red);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }

  .new-file-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
