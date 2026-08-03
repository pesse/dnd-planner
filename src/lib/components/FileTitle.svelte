<script lang="ts">
  import { activeFile } from '../stores/campaign';
  import { renameFile, renameStartValue } from '../services/renameFile';

  let { label, titleClass = '', renamable = false }: {
    label: string;
    titleClass?: string;
    renamable?: boolean;
  } = $props();

  let renaming = $state(false);
  let value = $state('');

  function start() {
    value = renameStartValue($activeFile);
    renaming = true;
  }

  async function commit() {
    if (!renaming) return;
    renaming = false;
    const file = $activeFile;
    if (!file || !value.trim()) return;
    await renameFile(file, value);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') renaming = false;
  }
</script>

<div class="file-title-area">
  {#if renaming}
    <input class="rename-input" bind:value {onkeydown} onblur={commit} autofocus />
  {:else}
    <span class="file-title {titleClass}">{label}</span>
    {#if renamable}
      <button class="rename-btn" onclick={start} title="Datei umbenennen">✏</button>
    {/if}
  {/if}
</div>

<style>
  .file-title-area {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: 0.5rem;
    min-width: 0;
    max-width: 40%;
  }

  .file-title {
    font-size: 0.82rem;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .npc-title {
    color: var(--arcane);
  }

  .monster-title {
    color: var(--danger);
  }

  .encounter-title {
    color: var(--steel);
  }

  .spell-title {
    color: var(--arcane);
  }

  .item-title {
    color: var(--copper);
  }

  .class-title {
    color: var(--copper);
  }

  .species-title {
    color: var(--green);
  }

  .feat-title {
    color: var(--gold);
  }

  .background-title {
    color: var(--teal);
  }

  .rename-btn {
    background: transparent;
    border: none;
    color: var(--border);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.1rem 0.2rem;
    flex-shrink: 0;
    border-radius: 3px;
  }

  .rename-btn:hover { color: var(--red); background: var(--surface); }

  .rename-input {
    background: var(--bg);
    border: 1px solid var(--red);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.82rem;
    padding: 0.2rem 0.4rem;
    outline: none;
    min-width: 0;
    width: 220px;
    font-family: inherit;
  }
</style>
