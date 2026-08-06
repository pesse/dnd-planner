<script lang="ts">
  import { activeCampaign } from '../../../stores/campaign';
  import { deleteEntry } from '../../../services/sidebar/deleteEntry';
  import DelButton from './DelButton.svelte';
  import SectionBlock from './SectionBlock.svelte';
  import { campaignDirPath, SECTIONS, type CampaignTreeState } from './campaignTreeState.svelte';
  import type { Campaign } from '../../../types';
  import '../tree.css';

  let { tree, campaign }: { tree: CampaignTreeState; campaign: Campaign } = $props();
</script>

<div class="campaign-section">
  <div class="entry-row">
    <button
      class="campaign-title"
      class:active={$activeCampaign?.id === campaign.id}
      onclick={() => tree.selectCampaign(campaign)}
    >
      {campaign.name}
    </button>
    <DelButton ondelete={() => deleteEntry(campaignDirPath(campaign.path), campaign.name, true, () => tree.afterDeleteCampaign(campaign.path))} />
  </div>

  {#if $activeCampaign?.id === campaign.id}
    {#each SECTIONS as section}
      <SectionBlock {tree} {campaign} {section} />
    {/each}
  {/if}
</div>

<style>
  .campaign-section {
    padding: 0.25rem 0;
  }

  .campaign-title {
    width: 100%;
    text-align: left;
    padding: 0.4rem 1rem;
    background: none;
    border: none;
    color: var(--ink);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .campaign-title:hover,
  .campaign-title.active {
    background: var(--surface);
    color: var(--arcane);
  }
</style>
