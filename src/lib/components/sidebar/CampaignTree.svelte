<script lang="ts">
  import { untrack } from 'svelte';
  import { activeCampaign, activeFile, vaultVersion } from '../../stores/campaign';
  import { loadActSummaries, loadEncounterContext, loadCampaignContent } from '../../stores/context';
  import { createCampaignTreeState, sectionKeyOf, VAULT_BASE, SECTIONS } from './campaign/campaignTreeState.svelte';
  import CampaignRow from './campaign/CampaignRow.svelte';
  import NewEntryRow from './campaign/NewEntryRow.svelte';
  import './tree.css';

  const tree = createCampaignTreeState();

  export async function reload() {
    await tree.reload();
  }

  // Am Store, nicht am Aufrufer: sonst fehlt der Kontext nach HMR-Store-Reset und auf
  // Pfaden, die `activeCampaign.set()` ohne eigenen Lade-Call benutzen.
  $effect(() => {
    const campaign = $activeCampaign;
    if (campaign?.path) {
      loadCampaignContent(campaign.path);
      loadActSummaries(campaign.path);
      loadEncounterContext(campaign.path);
    }
  });

  $effect(() => {
    const _v = $vaultVersion;
    const campaign = $activeCampaign;
    if (!campaign) return;
    for (const section of SECTIONS) {
      const key = sectionKeyOf(campaign.path, section);
      if (tree.expanded[key]) tree.loadSection(campaign.path, section);
    }
  });

  // Reagiert nur auf den Pfad-Wechsel: `untrack` verhindert ein Re-Expandieren, wenn der
  // Nutzer manuell zuklappt.
  $effect(() => {
    const path = $activeFile?.path;
    if (!path) return;
    const campaign = $activeCampaign;
    if (!campaign) return;
    const base = `${VAULT_BASE}/${campaign.path}/`;
    if (!path.startsWith(base)) return; // nur Dateien der aktiven Kampagne
    const subdir = path.slice(base.length).split('/')[0]; // acts | world | npcs | sessions | notes
    const section = SECTIONS.find((s) => s.subdir === subdir);
    if (!section) return; // z.B. campaign.md selbst → kein Überpunkt
    const key = sectionKeyOf(campaign.path, section);
    untrack(() => {
      if (!tree.expanded[key]) {
        tree.expanded[key] = true;
        tree.loadSection(campaign.path, section);
      }
    });
  });
</script>

<div class="section-row campaigns-header">
  <span class="campaigns-label">Kampagnen</span>
  <button class="add-btn" style="opacity:1" title="Neue Kampagne" onclick={() => { tree.showNewCampaignInput = true; tree.newCampaignInput = ''; }}>+</button>
</div>

{#if tree.showNewCampaignInput}
  <NewEntryRow
    bind:value={tree.newCampaignInput}
    placeholder="Kampagnenname…"
    rowStyle="padding-left: 1rem"
    onkeydown={(e) => { tree.createCampaign(e); tree.cancelNewCampaign(e); }}
    onconfirm={(e) => tree.createCampaign(e)}
  />
{/if}

{#each tree.campaigns as campaign}
  <CampaignRow {tree} {campaign} />
{/each}

<style>
  .campaigns-header {
    padding: 0.4rem 0.5rem 0.4rem 1rem;
  }

  .campaigns-label {
    flex: 1;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
</style>
