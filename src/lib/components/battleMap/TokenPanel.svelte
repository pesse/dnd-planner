<script lang="ts">
  /** Tokens einsetzen: Gruppe, Charakter, Encounter, Monster, Markierung. */
  import { onMount } from 'svelte';
  import { activeCampaign } from '../../stores/campaign';
  import { characterLabel, listCharacterRefs, type CharacterRef } from '../../services/characterDirectory';
  import { campaignCharacterData, encounterSummaries, monsterLibrary } from '../../stores/context';
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { pxToCell, type Point } from '../../services/battleMap/geometry';
  import {
    characterDraft,
    encounterDrafts,
    libraryMonsterDraft,
    markerDraft,
  } from '../../services/battleMap/tokenSources';
  import { encounterPath } from '../../services/battleMap/tokenDetails';
  import PanelSection from './PanelSection.svelte';

  let { editor, center }: { editor: MapEditor; center: () => Point } = $props();

  let characters = $state<CharacterRef[]>([]);
  let characterUid = $state('');
  let encounterKey = $state('');
  let monsterQuery = $state('');
  let markerName = $state('');
  let busy = $state(false);

  const map = $derived(editor.map!);
  const originCell = () => pxToCell(map.grid, center());

  async function run(job: () => Promise<void>) {
    busy = true;
    editor.error = '';
    try {
      await job();
    } catch (e) {
      editor.error = String(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void listCharacterRefs().then((refs) => (characters = refs));
  });

  function addCharacter() {
    const ref = characters.find((c) => c.uid === characterUid);
    if (!ref) return;
    editor.addTokens([characterDraft(ref.uid, characterLabel(ref))], originCell());
    characterUid = '';
  }

  const addParty = () =>
    editor.addTokens($campaignCharacterData.map((c) => characterDraft(c.slug, c.name)), originCell());

  const addEncounter = () =>
    run(async () => {
      const enc = $encounterSummaries.find((e) => `${e.actSlug}/${e.slug}` === encounterKey);
      if (!enc || !$activeCampaign) return;
      const key = `${enc.actSlug}/${enc.slug}`;
      editor.addTokens(await encounterDrafts(encounterPath(`./vault/campaigns/${$activeCampaign.path}`, key), key), originCell());
      editor.details.show({ kind: 'encounter', key });
    });

  const addMonster = () =>
    run(async () => {
      const q = monsterQuery.trim().toLowerCase();
      const entry = $monsterLibrary.find((m) => m.name.toLowerCase() === q || m.slug === q);
      if (!entry) throw new Error(`Kein Monster „${monsterQuery}" in der Bibliothek.`);
      const draft = await libraryMonsterDraft(entry.slug);
      if (draft) editor.addTokens([draft], originCell());
      monsterQuery = '';
    });

  function addMarker() {
    const name = markerName.trim() || 'Markierung';
    editor.addTokens([markerDraft(name)], originCell());
    markerName = '';
  }

</script>

<PanelSection title="Einsetzen">
  <button class="wide" disabled={!$campaignCharacterData.length} onclick={addParty} title="Alle Charaktere, die in der Kampagne eingetragen sind">
    Gruppe der Kampagne ({$campaignCharacterData.length})
  </button>

  <div class="row">
    <select bind:value={characterUid} aria-label="Charakter">
      <option value="">Charakter wählen…</option>
      {#each characters as c (c.uid)}
        <option value={c.uid}>{characterLabel(c)}{c.classLevel ? ` (${c.classLevel})` : ''}</option>
      {/each}
    </select>
    <button disabled={!characterUid} onclick={addCharacter}>+</button>
  </div>

  <div class="row">
    <select bind:value={encounterKey} aria-label="Encounter">
      <option value="">Encounter wählen…</option>
      {#each $encounterSummaries as e}
        <option value="{e.actSlug}/{e.slug}">{e.name}</option>
      {/each}
    </select>
    <button disabled={!encounterKey || busy} onclick={addEncounter}>+</button>
  </div>

  <div class="row">
    <input list="map-monster-list" bind:value={monsterQuery} placeholder="Monster aus Bibliothek…" onkeydown={(e) => e.key === 'Enter' && addMonster()} />
    <datalist id="map-monster-list">
      {#each $monsterLibrary as m}
        <option value={m.name}></option>
      {/each}
    </datalist>
    <button disabled={!monsterQuery.trim() || busy} onclick={addMonster}>+</button>
  </div>

  <div class="row">
    <input bind:value={markerName} placeholder="Markierung / NSC…" onkeydown={(e) => e.key === 'Enter' && addMarker()} />
    <button onclick={addMarker}>+</button>
  </div>
</PanelSection>

<style>
  .row {
    display: flex;
    gap: 0.3rem;
  }
  .row > :first-child {
    flex: 1;
    min-width: 0;
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
