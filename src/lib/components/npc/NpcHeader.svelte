<script lang="ts">
  import type { Npc } from '../../schemas/npc';

  let { npc, dirty, saveError, onopenjson }: {
    npc: Npc;
    dirty: boolean;
    saveError: string | null;
    onopenjson: () => void;
  } = $props();

  const STATUS_LABELS: Record<Npc['status'], string> = {
    lebendig: 'Lebendig', tot: 'Tot', vermisst: 'Vermisst', unbekannt: 'Unbekannt',
  };
</script>

<div class="npc-header">
  <div class="name-block">
    <input class="npc-name" bind:value={npc.name} placeholder="Name" />
    <input class="npc-role" bind:value={npc.role} placeholder="Rolle" />
  </div>
  <div class="header-right">
    <select class="npc-status status-{npc.status}" bind:value={npc.status}>
      {#each Object.entries(STATUS_LABELS) as [val, label]}
        <option value={val}>{label}</option>
      {/each}
    </select>
    <div class="header-foot">
      {#if saveError}<span class="save-error-msg">{saveError}</span>{/if}
      <span class="dirty-dot">{dirty ? '●' : ''}</span>
      <button class="json-btn" onclick={onopenjson}>JSON</button>
    </div>
  </div>
</div>

<style>
  .npc-header {
    padding: 0.9rem 1.5rem 0.6rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .name-block { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }

  .npc-name {
    background: none;
    border: none;
    color: var(--arcane);
    font-size: 1.4rem;
    font-weight: 700;
    padding: 0;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .npc-name:focus { border-bottom: 1px solid var(--red); }

  .npc-role {
    background: none;
    border: none;
    color: var(--ink-muted);
    font-size: 0.85rem;
    font-style: italic;
    padding: 0;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .npc-role:focus { border-bottom: 1px solid var(--surface); }

  .header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .npc-status {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 99px;
    color: var(--ink);
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    outline: none;
    font-family: inherit;
  }
  .npc-status.status-lebendig { color: var(--green); border-color: var(--green); }
  .npc-status.status-tot      { color: var(--ink-muted); border-color: var(--border); }
  .npc-status.status-vermisst { color: var(--copper); border-color: var(--copper); }
  .npc-status.status-unbekannt{ color: var(--red); border-color: var(--red); }

  .header-foot {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .dirty-dot { font-size: 0.7rem; color: var(--danger); width: 0.8rem; }
  .save-error-msg { font-size: 0.72rem; color: var(--danger); }

  .json-btn {
    background: none;
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink-muted);
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    font-family: inherit;
  }
  .json-btn:hover { border-color: var(--ink-muted); color: var(--ink); }
</style>
