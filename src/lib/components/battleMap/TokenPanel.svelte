<script lang="ts">
  /** Tokens einsetzen: Gruppe, Charakter, Encounter, Monster, Falle, Markierung. */
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
    trapDraft,
  } from '../../services/battleMap/tokenSources';
  import { encounterPath, mapEncounters } from '../../services/battleMap/tokenDetails';
  import PanelSection from './PanelSection.svelte';
  import { getTraps, trapDisplayName, type TrapInfo } from '../../trapsLibrary';

  let { editor, center }: { editor: MapEditor; center: () => Point } = $props();

  let characters = $state<CharacterRef[]>([]);
  let characterUid = $state('');
  let encounterKey = $state('');
  let monsterQuery = $state('');
  let markerName = $state('');
  let trapQuery = $state('');
  let traps = $state<TrapInfo[]>([]);
  let busy = $state(false);

  const map = $derived(editor.map!);
  const encounters = $derived(mapEncounters($encounterSummaries, map));
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
    void getTraps().then((list) => (traps = list.toSorted((a, b) => trapDisplayName(a).localeCompare(trapDisplayName(b), 'de'))));
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
      const key = encounters.find((e) => e.key === encounterKey)?.key;
      if (!key || !$activeCampaign) return;
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

  /** Ein Name ohne Bibliothekseintrag ergibt eine freie Falle, deren Werte in der Notiz stehen. */
  function addTrap() {
    const q = trapQuery.trim();
    const hit = traps.find((t) => trapDisplayName(t).toLowerCase() === q.toLowerCase() || t.name.toLowerCase() === q.toLowerCase());
    editor.addTokens([trapDraft(hit ? trapDisplayName(hit) : q || 'Falle', hit?.key)], originCell());
    trapQuery = '';
  }

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
      {#each encounters as e (e.key)}
        <option value={e.key}>{e.name}</option>
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
    <input list="map-trap-list" bind:value={trapQuery} placeholder="Falle aus Bibliothek…" onkeydown={(e) => e.key === 'Enter' && addTrap()} />
    <datalist id="map-trap-list">
      {#each traps as t (t.key)}
        <option value={trapDisplayName(t)}></option>
      {/each}
    </datalist>
    <button onclick={addTrap}>+</button>
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
