<script lang="ts">
  import SectionHeader from '../SectionHeader.svelte';
  import ActRow from './ActRow.svelte';
  import FileRow from './FileRow.svelte';
  import NewEntryRow from './NewEntryRow.svelte';
  import { sectionEntryPath, sectionKeyOf, type CampaignSection, type CampaignTreeState } from './campaignTreeState.svelte';
  import type { Campaign } from '../../../types';
  import '../tree.css';

  let { tree, campaign, section }: {
    tree: CampaignTreeState;
    campaign: Campaign;
    section: CampaignSection;
  } = $props();

  const key = $derived(sectionKeyOf(campaign.path, section));
</script>

<div class="section">
  <SectionHeader
    label={section.label}
    expanded={tree.expanded[key]}
    ontoggle={() => tree.toggleSection(campaign.path, section)}
  >
    {#snippet actions()}
      <button class="add-btn" title="Neue Datei" onclick={() => { tree.expanded[key] = true; tree.loadSection(campaign.path, section); tree.startNewFile(key); }}>
        +
      </button>
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
      {:else if !tree.showNewFileInput[key]}
        <span class="empty">Keine Dateien</span>
      {/if}

      {#if tree.showNewFileInput[key]}
        <NewEntryRow
          bind:value={tree.newFileInput[key]}
          placeholder="Name…"
          onkeydown={(e) => { tree.createFile(campaign.path, section, e); tree.cancelNewFile(key, e); }}
          onconfirm={(e) => tree.createFile(campaign.path, section, e)}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .section {
    padding: 0 0 0.25rem 0;
  }
</style>
