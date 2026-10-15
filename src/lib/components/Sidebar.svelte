<script lang="ts">
  import VaultTransferModal from './VaultTransferModal.svelte';
  import LibraryManager from './LibraryManager.svelte';
  import CreateCardModal from './CreateCardModal.svelte';
  import CampaignTree from './sidebar/CampaignTree.svelte';
  import CharacterSection from './sidebar/CharacterSection.svelte';
  import GroupedSectionView from './sidebar/GroupedSection.svelte';
  import SidebarHeader from './sidebar/SidebarHeader.svelte';
  import SidebarSection from './sidebar/SidebarSection.svelte';
  import { libraryManagerOpen } from '../stores/libraries';
  import { LIBRARY_SECTIONS } from '../services/sidebar/librarySections';
  import { GROUPED_SECTIONS } from '../services/sidebar/groupedSections';
  import { CREATE_SPECS, type CreateKind } from '../services/sidebar/createSpecs';

  let createModal = $state<CreateKind | null>(null);
  let showTransferModal = $state(false);
</script>

<aside class="sidebar">
  <SidebarHeader onTransferClick={() => (showTransferModal = true)} />

  <CharacterSection />

  {#each GROUPED_SECTIONS as section}
    <GroupedSectionView {section} oncreate={() => (createModal = section.kind)} />
  {/each}

  {#each LIBRARY_SECTIONS as section}
    <SidebarSection {section} oncreate={() => (createModal = section.kind)} />
  {/each}

  {#if $libraryManagerOpen}
    <LibraryManager onclose={() => libraryManagerOpen.set(false)} />
  {/if}

  {#if showTransferModal}
    <VaultTransferModal onclose={() => (showTransferModal = false)} />
  {/if}

  {#if createModal}
    <CreateCardModal {...CREATE_SPECS[createModal]} onclose={() => (createModal = null)} />
  {/if}

  <div class="divider"></div>

  <CampaignTree />
</aside>

<style>
  .sidebar {
    width: 100%;
    height: 100%;
    background:
      linear-gradient(color-mix(in srgb, var(--bg) 55%, transparent)),
      url('/branding/sidebar-v2.webp') bottom / 100% auto no-repeat,
      var(--bg);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--surface);
    flex-shrink: 0;
    overflow-y: auto;
  }

  .divider {
    height: 1px;
    background: var(--surface);
    margin: 0.25rem 0;
  }
</style>
