<script lang="ts">
  import SectionHeader from '../SectionHeader.svelte';
  import ActRow from './ActRow.svelte';
  import FileRow from './FileRow.svelte';
  import { askName } from '../../../stores/nameDialog';
  import { sectionEntryPath, sectionKeyOf, type CampaignSection, type CampaignTreeState } from './campaignTreeState.svelte';
  import type { Campaign } from '../../../types';
  import '../tree.css';

  let { tree, campaign, section }: {
    tree: CampaignTreeState;
    campaign: Campaign;
    section: CampaignSection;
  } = $props();

  const key = $derived(sectionKeyOf(campaign.path, section));

  async function create() {
    const name = await askName({ title: section.newLabel });
    if (!name) return;
    tree.expanded[key] = true;
    await tree.createFile(campaign.path, section, name);
  }
</script>

<div class="section">
  <SectionHeader
    label={section.label}
    expanded={tree.expanded[key]}
    ontoggle={() => tree.toggleSection(campaign.path, section)}
  >
    {#snippet actions()}
      <button class="add-btn" title={section.newLabel} onclick={create}>+</button>
    {/snippet}
  </SectionHeader>

  {#if tree.expanded[key]}
    <div class="file-list">
      {#if tree.sectionFiles[key]?.length}
        {#each tree.sectionFiles[key] as filename, i}
          {@const filePath = sectionEntryPath(campaign.path, section, filename)}
          {#if section.type === 'act'}
            <ActRow {tree} {campaign} {section} {filePath} {filename} index={i} count={tree.sectionFiles[key].length} />
          {:else}
            <FileRow {tree} {campaign} {section} {filePath} {filename} />
          {/if}
        {/each}
      {:else}
        <span class="empty">Keine Dateien</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .section {
    padding: 0 0 0.25rem 0;
  }
</style>
