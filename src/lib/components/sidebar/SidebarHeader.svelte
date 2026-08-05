<script lang="ts">
  import DragonMark from '../DragonMark.svelte';
  import { updateState, updateDialogOpen } from '../../stores/update';
  import { libraries, libraryManagerOpen, updateCount } from '../../stores/libraries';

  let { onReloadAll, onTransferClick }: {
    onReloadAll(): void;
    onTransferClick(): void;
  } = $props();

  let libUpdates = $derived(updateCount($libraries));
</script>

<div class="sidebar-header ornament-top">
  <h2><DragonMark size={18} /> DnD Planner</h2>
  <div class="header-actions">
    {#if $updateState.status === 'available'}
      <button
        class="header-btn update-btn"
        title={`Update auf v${$updateState.version} verfügbar`}
        onclick={() => updateDialogOpen.set(true)}
      >⬆</button>
    {/if}
    <button
      class="header-btn"
      class:library-update={libUpdates > 0}
      title={libUpdates > 0
        ? `${libUpdates} Bibliotheks-Update(s) verfügbar`
        : 'Bibliotheken verwalten'}
      onclick={() => libraryManagerOpen.set(true)}
    >📚</button>
    <button class="header-btn" title="Vault importieren / exportieren" onclick={onTransferClick}>⇅</button>
    <button class="reload-all-btn" title="Alles neu laden" onclick={onReloadAll}>↺</button>
  </div>
</div>

<style>
  .sidebar-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    align-items: center;
  }

  .sidebar-header h2 {
    margin: 0;
    flex: 1;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--red);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .sidebar-header h2 :global(.dragon-mark) {
    color: var(--red);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }

  .reload-all-btn,
  .header-btn {
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.1rem 0.3rem;
    line-height: 1;
    opacity: 0.5;
    transition: opacity 0.1s, color 0.1s;
  }

  .sidebar-header:hover .reload-all-btn,
  .sidebar-header:hover .header-btn {
    opacity: 1;
  }

  .reload-all-btn:hover,
  .header-btn:hover {
    color: var(--arcane);
  }

  .update-btn {
    opacity: 1;
    color: var(--gold);
  }
  .sidebar-header .update-btn { opacity: 1; }
  .update-btn:hover { color: var(--gold); filter: brightness(1.2); }

  .header-btn.library-update { color: var(--gold); opacity: 1; }
  .header-btn.library-update:hover { filter: brightness(1.2); }
</style>
