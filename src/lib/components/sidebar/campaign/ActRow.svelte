<script lang="ts">
  import { activeFile } from '../../../stores/campaign';
  import { askName } from '../../../stores/nameDialog';
  import { actKeyOf, encounterPathOf, type CampaignSection, type CampaignTreeState } from './campaignTreeState.svelte';
  import type { Campaign } from '../../../types';
  import '../tree.css';

  let { tree, campaign, section, filePath, filename, index, count }: {
    tree: CampaignTreeState;
    campaign: Campaign;
    section: CampaignSection;
    filePath: string;
    filename: string;
    index: number;
    count: number;
  } = $props();

  const actEncKey = $derived(actKeyOf(campaign.path, filename));
  const actEncs = $derived(tree.encounterFiles[actEncKey] ?? []);

  async function addEncounter() {
    const name = await askName({ title: `Neuer Encounter in „${tree.fileTitles[filePath] ?? filename}“` });
    if (name) await tree.createActEncounter(campaign.path, filename, name);
  }
</script>

<div class="act-row">
  <button
    class="file-entry act-entry"
    class:active={$activeFile?.path === filePath}
    onclick={() => tree.openFile(campaign.path, section, filename)}
    title={filename}
  >
    {tree.fileTitles[filePath] ?? filename}
  </button>
  <button
    class="move-btn"
    title="Nach oben"
    disabled={index === 0}
    onclick={(e) => { e.stopPropagation(); tree.moveAct(campaign.path, section, index, -1); }}
  >▲</button>
  <button
    class="move-btn"
    title="Nach unten"
    disabled={index === count - 1}
    onclick={(e) => { e.stopPropagation(); tree.moveAct(campaign.path, section, index, 1); }}
  >▼</button>
  <button
    class="add-btn"
    title="Encounter hinzufügen"
    onclick={addEncounter}
  >+</button>
</div>

{#each actEncs as encFilename}
  {@const encPath = encounterPathOf(campaign.path, filename, encFilename)}
  {@const encLabel = tree.encounterNames[`${actEncKey}/${encFilename}`] ?? encFilename.replace('.json', '')}
  <button
    class="file-entry encounter-entry act-enc-entry"
    class:active={$activeFile?.path === encPath}
    onclick={() => tree.openEncounter(campaign.path, filename, encFilename)}
    title={encFilename.replace('.json', '')}
  >
    ⚡ {encLabel}
  </button>
{/each}

<style>
  .act-row {
    display: flex;
    align-items: center;
  }
</style>
