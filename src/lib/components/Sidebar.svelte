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

  type Reloadable = { reload: () => Promise<void> };
  let globalSections: (Reloadable | undefined)[] = $state([]);
  let campaignTree: Reloadable | undefined = $state();
  let characterSection: Reloadable | undefined = $state();

  async function reloadAll() {
    await campaignTree?.reload();
    await characterSection?.reload();
    for (const section of globalSections) await section?.reload();
  }
</script>

<aside class="sidebar">
  <SidebarHeader onReloadAll={reloadAll} onTransferClick={() => (showTransferModal = true)} />

  <CharacterSection bind:this={characterSection} />

  {#each GROUPED_SECTIONS as section, i}
    <GroupedSectionView
      {section}
      oncreate={() => (createModal = section.kind)}
      bind:this={globalSections[i]}
    />
  {/each}

  {#each LIBRARY_SECTIONS as section, i}
    <SidebarSection
      {section}
      oncreate={() => (createModal = section.kind)}
      bind:this={globalSections[GROUPED_SECTIONS.length + i]}
    />
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

  <CampaignTree bind:this={campaignTree} />
</aside>

<style>
  .sidebar {
    width: 100%;
    height: 100%;
    background: var(--bg);
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
