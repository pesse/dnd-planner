<script lang="ts">
  import { updateState, updateDialogOpen } from '../../stores/update';
  import { libraries, libraryManagerOpen, updateCount } from '../../stores/libraries';
  import { revealLogDir } from '../../services/appLog';
  import { checkForNews, checkingForNews } from '../../services/checkForNews';
  import { pushError } from '../../stores/toasts';

  let { onReloadAll, onTransferClick }: {
    onReloadAll(): void;
    onTransferClick(): void;
  } = $props();

  let libUpdates = $derived(updateCount($libraries));
</script>

<div class="sidebar-header ornament-top">
  <h2><img class="logo" src="/branding/logo.png" alt="DnD Planner" /></h2>
  <div class="header-actions">
    {#if $updateState.status === 'available'}
      <button
        class="header-btn update-btn"
        title={`Update auf v${$updateState.version} verfügbar`}
        onclick={() => updateDialogOpen.set(true)}
      ><img src="/branding/icons/update.png" alt="" /></button>
    {:else}
      <button
        class="header-btn"
        class:checking={$checkingForNews}
        disabled={$checkingForNews}
        title={$checkingForNews ? 'Suche nach Neuerungen…' : 'Auf Neuerungen prüfen'}
        onclick={() => checkForNews()}
      ><img src="/branding/icons/reload.png" alt="" /></button>
    {/if}
    <button
      class="header-btn"
      class:library-update={libUpdates > 0}
      title={libUpdates > 0
        ? `${libUpdates} Bibliotheks-Update(s) verfügbar`
        : 'Bibliotheken verwalten'}
      onclick={() => libraryManagerOpen.set(true)}
    ><img src="/branding/icons/library.png" alt="" /></button>
    <button class="header-btn" title="Vault importieren / exportieren" onclick={onTransferClick}><img src="/branding/icons/transfer.png" alt="" /></button>
    <button
      class="header-btn"
      title="Fehlerprotokoll im Explorer zeigen"
      onclick={() => revealLogDir().catch((e) => pushError(`Log-Ordner nicht gefunden: ${e}`))}
    ><img src="/branding/icons/log.png" alt="" /></button>
    <button class="reload-all-btn" title="Alles neu laden" onclick={onReloadAll}><img src="/branding/icons/reload.png" alt="" /></button>
  </div>
</div>

<style>
  .sidebar-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    row-gap: 0.4rem;
  }

  .sidebar-header h2 {
    margin: 0;
    flex: 1 0 11rem;
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .logo {
    height: 1.9rem;
    max-width: 100%;
    object-fit: contain;
    object-position: left center;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }

  .reload-all-btn,
  .header-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    opacity: 0.5;
    transition: opacity 0.1s, filter 0.1s;
  }
  .reload-all-btn img,
  .header-btn img {
    display: block;
    width: 1.25rem;
    height: 1.25rem;
  }

  .sidebar-header:hover .reload-all-btn,
  .sidebar-header:hover .header-btn {
    opacity: 1;
  }

  .reload-all-btn:hover,
  .header-btn:hover {
    filter: brightness(1.25) drop-shadow(0 0 2px var(--gold));
  }

  .sidebar-header .update-btn { opacity: 1; }
  .header-btn.checking { cursor: progress; }
  .header-btn.checking img { animation: checking-pulse 1s ease-in-out infinite alternate; }
  @keyframes checking-pulse { to { opacity: 0.3; } }
  .header-btn.library-update { opacity: 1; filter: drop-shadow(0 0 3px var(--gold)); }
</style>
