<script lang="ts">
  import { activeFile } from '../../../stores/campaign';
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

<button
  class="file-entry"
  class:active={$activeFile?.path === filePath}
  onclick={() => tree.openFile(campaign.path, section, filename)}
  title={label}
>
  {label}
</button>
