<script lang="ts">
  import { activeFile } from '../../../stores/campaign';
  import { deleteEntry } from '../../../services/sidebar/deleteEntry';
  import DelButton from './DelButton.svelte';
  import type { CampaignSection, CampaignTreeState } from './campaignTreeState.svelte';
  import type { Campaign } from '../../../types';
  import '../tree.css';

  let { tree, campaign, section, filePath, filename }: {
    tree: CampaignTreeState;
    campaign: Campaign;
    section: CampaignSection;
    filePath: string;
    filename: string;
  } = $props();

  const label = $derived(tree.fileTitles[filePath] ?? filename.replace(/\.(md|json)$/, ''));
</script>

<div class="entry-row">
  <button
    class="file-entry"
    class:active={$activeFile?.path === filePath}
    onclick={() => tree.openFile(campaign.path, section, filename)}
    title={label}
  >
    {label}
  </button>
  <DelButton ondelete={() => deleteEntry(filePath, label, false, () => tree.loadSection(campaign.path, section))} />
</div>
