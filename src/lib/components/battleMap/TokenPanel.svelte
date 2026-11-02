<script lang="ts">
  /** Tokens einsetzen (Gruppe, Charakter, Encounter, Monster, Markierung) und verwalten. */
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

  let { editor, center }: { editor: MapEditor; center: () => Point } = $props();

  const SIZES = [
    { value: 0.5, label: 'Winzig' },
    { value: 1, label: 'Klein/Mittel' },
    { value: 2, label: 'Groß' },
    { value: 3, label: 'Riesig' },
    { value: 4, label: 'Gigantisch' },
  ];

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
      const path = `./vault/campaigns/${$activeCampaign.path}/acts/${enc.actSlug}/encounters/${enc.slug}.json`;
      editor.addTokens(await encounterDrafts(path), originCell());
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

  function toggleHidden(id: string, hidden: boolean) {
    editor.checkpoint();
    editor.updateToken(id, { hidden: !hidden });
  }
</script>

<section>
  <h3>Einsetzen</h3>
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
</section>

<section>
  <h3>
    Tokens
    <span class="bulk">
      <button title="Alle Monster verstecken" onclick={() => editor.setAllHidden('monster', true)}>🙈</button>
      <button title="Alle Monster zeigen" onclick={() => editor.setAllHidden('monster', false)}>👁</button>
    </span>
  </h3>
  {#if !map.tokens.length}
    <p class="hint">Noch keine Tokens.</p>
  {/if}
  <ul>
    {#each map.tokens as t (t.id)}
      <li class:selected={t.id === editor.selectedId}>
        <button class="eye" title={t.hidden ? 'Für Spieler versteckt — zeigen' : 'Für Spieler sichtbar — verstecken'} onclick={() => toggleHidden(t.id, t.hidden)}>
          {t.hidden ? '🙈' : '👁'}
        </button>
        <button class="name" class:muted={t.hidden} onclick={() => (editor.selectedId = t.id)}>{t.name}</button>
        <button class="del" title="Entfernen" onclick={() => editor.removeToken(t.id)}>✕</button>
      </li>
    {/each}
  </ul>
</section>

{#if editor.selected}
  {@const t = editor.selected}
  <section>
    <h3>Ausgewählt</h3>
    <label>Name <input value={t.name} onchange={(e) => { editor.checkpoint(); editor.updateToken(t.id, { name: e.currentTarget.value }); }} /></label>
    <label>
      Größe
      <select value={t.size} onchange={(e) => { editor.checkpoint(); editor.updateToken(t.id, { size: Number(e.currentTarget.value) }); }}>
        {#each SIZES as s}
          <option value={s.value}>{s.label}</option>
        {/each}
      </select>
    </label>
    <label>Farbe <input type="color" value={t.color} onchange={(e) => { editor.checkpoint(); editor.updateToken(t.id, { color: e.currentTarget.value }); }} /></label>
  </section>
{/if}

<style>
  section {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  h3 {
    margin: 0 0 0.2rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    display: flex;
    align-items: center;
  }
  .bulk {
    margin-left: auto;
    display: flex;
    gap: 0.2rem;
  }
  .row {
    display: flex;
    gap: 0.3rem;
  }
  .row > :first-child {
    flex: 1;
    min-width: 0;
  }
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  label input:not([type='color']),
  label select {
    width: 60%;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 16rem;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border-radius: 4px;
  }
  li.selected {
    background: var(--surface);
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
  li button {
    border: none;
    background: none;
  }
  .name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name.muted {
    color: var(--ink-muted);
    font-style: italic;
  }
  .del {
    color: var(--danger);
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
</style>
