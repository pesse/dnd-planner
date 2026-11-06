<script lang="ts">
  /** Ein Encounter zum Bearbeiten im Tab Vorbereitung. Speichert selbst, wie die Karte, und hält seine Tokens auf der Karte in Zahl. */
  import { onMount } from 'svelte';
  import { ENCOUNTER_DIFFICULTIES, type Encounter } from '../../../schemas/encounter';
  import type { Monster } from '../../../types';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { encounterXp, scopeDirOf, serializeEncounter, totalCount, withEntryCount, withMonsterCount, withRestored } from '../../../services/battleMap/encounterEdit';
  import { useEncounterPicker, type EncounterPickTarget } from '../../../services/battleMap/encounterPicker.svelte';
  import { encounterDrafts } from '../../../services/battleMap/tokenSources';
  import { pxToCell, type Point } from '../../../services/battleMap/geometry';
  import { formatMonsterList, readScopeMonsters } from '../../../services/contextLoad';
  import { getMonsterLibrary } from '../../../monsterLibrary';
  import { scopeMonsterRows } from '../../../services/catalog/monsterCatalog';
  import { patchEncounterSummary } from '../../../stores/context';
  import { crLabel } from '../../../services/monsterFormat';
  import { AutosaveFile } from '../../../utils/autosaveFile.svelte';
  import type { CatalogRow } from '../../../services/catalog/catalogTypes';
  import RichTextEditor from '../../RichTextEditor.svelte';
  import InlineNote from './InlineNote.svelte';

  const TEXTS = [
    { field: 'read_aloud', label: 'Vorlesetext' },
    { field: 'description', label: 'Worum es geht' },
    { field: 'notes', label: 'SL-Notizen' },
    { field: 'loot', label: 'Beute' },
  ] as const;

  let { encounter = $bindable(), key, path, editor, center }: {
    encounter: Encounter;
    key: string;
    path: string;
    editor: MapEditor;
    center: () => Point;
  } = $props();

  const saver = new AutosaveFile(800);
  const picker = useEncounterPicker();
  let monsters = $state<Map<string, Monster> | null>(null);
  let ownRows = $state<CatalogRow[]>([]);
  let removed = $state<{ entry: Encounter['monsters'][number]; index: number; name: string } | null>(null);

  onMount(async () => {
    const scope = scopeDirOf(path);
    const [library, own, rows] = await Promise.all([getMonsterLibrary(), readScopeMonsters(scope), scopeMonsterRows(scope)]);
    monsters = new Map([...library, ...own].map((m) => [m.slug, m.monster]));
    ownRows = rows;
  });

  const nameOf = (slug: string) => monsters?.get(slug)?.name ?? slug;
  const countOf = (slug: string) => totalCount(encounter.monsters, slug);
  const tokensOf = (slug: string) => editor.map?.tokens.filter((t) => t.encounter === key && t.ref === slug) ?? [];
  const xp = $derived(monsters ? encounterXp(encounter.monsters, (slug) => monsters!.get(slug)?.xp) : null);

  // Die EP folgen der Monsterliste, sobald die Werte geladen sind — eine KI- oder Handangabe veraltet sonst still.
  $effect(() => {
    if (xp !== null && xp !== encounter.xp_total) encounter.xp_total = xp;
  });

  let lastSaved = serializeEncounter($state.snapshot(encounter));
  $effect(() => {
    const json = serializeEncounter($state.snapshot(encounter));
    if (json === lastSaved) return;
    lastSaved = json;
    saver.schedule(path, json);
    const [actSlug, slug] = key.includes('/') ? key.split('/') : ['', key];
    patchEncounterSummary(actSlug, slug, {
      name: encounter.name,
      difficulty: encounter.difficulty,
      xpTotal: encounter.xp_total,
      monsterList: formatMonsterList(encounter.monsters, (s) => {
        const m = monsters?.get(s);
        return m && { name: m.name, cr: m.challenge_rating };
      }),
    });
  });

  // Hintereinander, sonst setzen zwei schnelle Klicks beide das fehlende Token.
  let syncing = Promise.resolve();
  function syncTokens(slug: string) {
    if (editor.map?.hiddenEncounters.includes(key)) return;
    syncing = syncing.then(async () => {
      const want = countOf(slug);
      const have = tokensOf(slug);
      for (const t of have.slice(want).reverse()) editor.removeToken(t.id);
      if (have.length >= want || !editor.map) return;
      const drafts = await encounterDrafts({ monsters: [{ slug, count: want }] }, path, key, have);
      editor.addTokens(drafts, pxToCell(editor.map.grid, center()));
    }).catch((e) => void (editor.error = String(e)));
  }

  function setCount(slug: string, delta: number) {
    const index = encounter.monsters.findIndex((m) => m.slug === slug);
    if (index >= 0) return setEntryCount(index, delta);
    encounter = withMonsterCount(encounter, slug, delta);
    if (removed?.entry.slug === slug) removed = null;
    syncTokens(slug);
  }

  function setEntryCount(index: number, delta: number) {
    const before = encounter.monsters[index];
    encounter = withEntryCount(encounter, index, delta);
    if (before.count + delta <= 0) removed = { entry: before, index, name: nameOf(before.slug) };
    syncTokens(before.slug);
  }

  function undoRemove() {
    if (!removed) return;
    encounter = withRestored(encounter, removed.entry, removed.index);
    syncTokens(removed.entry.slug);
    removed = null;
  }

  /** Jeder Klick wählt das nächste Token dieses Monsters. */
  function focusNext(slug: string) {
    const list = tokensOf(slug);
    if (!list.length) return;
    const at = list.findIndex((t) => t.id === editor.selectedId);
    editor.selectedId = list[(at + 1) % list.length].id;
  }

  const target: EncounterPickTarget = {
    get title() {
      return `Monster für „${encounter.name}“`;
    },
    get ownRows() {
      return ownRows;
    },
    count: countOf,
    add: (slug) => setCount(slug, 1),
    remove: (slug) => setCount(slug, -1),
    monster: (slug) => monsters?.get(slug),
  };
  $effect(() => {
    picker.target = target;
    return () => {
      if (picker.target === target) picker.target = null;
    };
  });

  $effect(() => () => void saver.flush());
</script>

<div class="editor">
  <input class="title" class:empty={!encounter.name.trim()} bind:value={encounter.name} placeholder="Name fehlt" aria-label="Name des Encounters" />
  <div class="row">
    <input bind:value={encounter.location} placeholder="Ort" aria-label="Ort" />
    <select bind:value={encounter.difficulty} aria-label="Schwierigkeit">
      {#each ENCOUNTER_DIFFICULTIES as d}<option value={d}>{d}</option>{/each}
    </select>
    <span class="save">{saver.status === 'saved' ? 'Gespeichert' : saver.status === 'saving' ? 'Speichert…' : 'Ungespeichert'}</span>
  </div>

  <section>
    <h3>
      <span>Monster{#if xp}<span class="xp">{xp.toLocaleString('de-DE')} EP</span>{/if}</span>
      <button class="add" class:active={picker.open} onclick={() => picker.toggle()}>+ Monster…</button>
    </h3>
    {#each encounter.monsters as m, i (i)}
      {@const lib = monsters?.get(m.slug)}
      {@const placed = tokensOf(m.slug)}
      <div class="monster" class:focused={placed.some((t) => t.id === editor.selectedId)}>
        <div class="line">
          <button class="name" title={placed.length ? 'Auf der Karte wählen — jeder Klick das nächste' : 'Steht nicht auf der Karte'} disabled={!placed.length} onclick={() => focusNext(m.slug)}>
            {lib?.name ?? m.slug}{#if lib}<span class="cr">HG {crLabel(lib.challenge_rating)}</span>{/if}
            {#if placed.length !== countOf(m.slug)}<span class="off">{placed.length}/{countOf(m.slug)} auf der Karte</span>{/if}
          </button>
          <button title="Eins weniger" onclick={() => setEntryCount(i, -1)}>−</button>
          <span class="count">{m.count}</span>
          <button title="Eins mehr" onclick={() => setEntryCount(i, 1)}>+</button>
          <button class="remove" title="Aus dem Encounter entfernen" onclick={() => setEntryCount(i, -m.count)}>✕</button>
        </div>
        <InlineNote bind:value={m.notes} placeholder="Notiz, z. B. Taktik oder Versteck" label="Notiz zu {lib?.name ?? m.slug}" />
      </div>
    {:else}
      <p class="hint">Noch keine Monster — über „+ Monster…“ aus der Bibliothek wählen.</p>
    {/each}
    {#if removed}
      <p class="undo">„{removed.name}“ entfernt <button onclick={undoRemove}>Rückgängig</button></p>
    {/if}
  </section>

  {#each TEXTS as t (t.field)}
    <div class="text">
      <span class="label">{t.label}</span>
      <div class="rich"><RichTextEditor value={encounter[t.field]} placeholder="…" collapsedToolbar onChange={(md) => (encounter[t.field] = md)} /></div>
    </div>
  {/each}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
  }
  .title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    padding: 0.25rem 0.4rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .row input {
    flex: 1;
    min-width: 0;
    padding: 0.2rem 0.4rem;
  }
  .save {
    font-size: 0.72rem;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  h3 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 0.3rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-soft);
  }
  button {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0.1rem 0.4rem;
  }
  button:hover {
    border-color: var(--border);
  }
  .add {
    border-color: var(--border);
    text-transform: none;
    letter-spacing: normal;
    font-size: 0.78rem;
  }
  .add.active {
    border-color: var(--red);
    color: var(--red);
  }
  .monster {
    padding: 0.15rem 0 0.3rem;
    border-bottom: 1px solid var(--surface);
    font-size: 0.85rem;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }
  .xp {
    margin-left: 0.5rem;
    text-transform: none;
    letter-spacing: normal;
    color: var(--ink-muted);
  }
  .title.empty {
    border-color: var(--danger);
  }
  .undo {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.3rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
  .undo button {
    border-color: var(--border);
    font-size: 0.75rem;
  }
  .monster .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    color: var(--ink);
    font-size: inherit;
    padding: 0.1rem 0.3rem;
  }
  .monster .name:disabled {
    cursor: default;
  }
  .monster.focused .name {
    border-color: var(--red);
  }
  .off {
    margin-left: 0.4rem;
    font-size: 0.72rem;
    color: var(--danger);
  }
  .cr {
    margin-left: 0.4rem;
    font-size: 0.72rem;
    color: var(--ink-muted);
  }
  .count {
    min-width: 1.4rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .remove {
    color: var(--danger);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .label {
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .rich {
    display: flex;
    height: 6rem;
    min-height: 3rem;
    resize: vertical;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .rich :global(.toolbar) {
    padding: 0.1rem 0.3rem;
  }
  .rich :global(.ProseMirror) {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .hint {
    margin: 0.2rem 0;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
</style>
