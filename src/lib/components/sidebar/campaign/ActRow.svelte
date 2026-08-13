<script lang="ts">
  import { activeFile } from '../../../stores/campaign';
  import { deleteEntry } from '../../../services/sidebar/deleteEntry';
  import DelButton from './DelButton.svelte';
  import NewEntryRow from './NewEntryRow.svelte';
  import { actDirPath, actKeyOf, encounterPathOf, type CampaignSection, type CampaignTreeState } from './campaignTreeState.svelte';
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
    onclick={() => { tree.showNewActEncounterInput[actEncKey] = true; tree.newActEncounterInput[actEncKey] = ''; }}
  >+</button>
  <DelButton ondelete={() => deleteEntry(actDirPath(campaign.path, filename), tree.fileTitles[filePath] ?? filename, true, () => tree.loadSection(campaign.path, section))} />
</div>

{#each actEncs as encFilename}
  {@const encPath = encounterPathOf(campaign.path, filename, encFilename)}
  {@const encLabel = tree.encounterNames[`${actEncKey}/${encFilename}`] ?? encFilename.replace('.json', '')}
  <div class="entry-row">
    <button
      class="file-entry encounter-entry act-enc-entry"
      class:active={$activeFile?.path === encPath}
      onclick={() => tree.openEncounter(campaign.path, filename, encFilename)}
      title={encFilename.replace('.json', '')}
    >
      ⚡ {encLabel}
    </button>
    <DelButton ondelete={() => deleteEntry(encPath, encLabel, false, () => tree.loadEncountersForAct(campaign.path, filename))} />
  </div>
{/each}

{#if tree.showNewActEncounterInput[actEncKey]}
  <NewEntryRow
    bind:value={tree.newActEncounterInput[actEncKey]}
    placeholder="Encounter…"
    rowClass="act-enc-input"
    onkeydown={(e) => { tree.createActEncounter(campaign.path, filename, e); tree.cancelNewActEncounter(actEncKey, e); }}
    onconfirm={(e) => tree.createActEncounter(campaign.path, filename, e)}
  />
{/if}

<style>
  .act-row {
    display: flex;
    align-items: center;
  }
</style>
