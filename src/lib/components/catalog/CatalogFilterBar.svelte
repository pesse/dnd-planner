<script lang="ts">
  import type { Snippet } from 'svelte';
  import { facetOptions, type CatalogGroup, type CatalogRow, type CatalogSpec } from '../../services/catalog/catalogTypes';
  import type { CatalogQuery } from './catalogFilterState.svelte';
  import MultiSelect from '../ui/MultiSelect.svelte';

  let { spec, query, groups, group, groupRows, count, sortColumns, lead, onsetgroup }: {
    spec: CatalogSpec;
    query: CatalogQuery;
    groups: CatalogGroup[];
    group: string;
    /** Die Zeilen der gewählten Gruppe — aus ihnen kommen die Facettenwerte. */
    groupRows: CatalogRow[];
    count: string;
    /** Eine Sortier-Auswahl braucht nur, wer keine Spaltenköpfe zum Anklicken hat. */
    sortColumns?: { ids: string[]; active: string };
    lead?: Snippet;
    onsetgroup: (id: string) => void;
  } = $props();

  const ALL = '*';

  // Eine Facette mit nur einem Wert in dieser Gruppe filtert nichts und bleibt weg.
  let facets = $derived(
    Object.entries(spec.facets)
      .map(([id, def]) => ({ id, ...def, options: facetOptions(groupRows, id) }))
      .filter((f) => f.options.length > 1 || f.id in query.facets),
  );
</script>

<div class="controls">
  {@render lead?.()}
  <input class="search" type="search" placeholder="Suchen…" bind:value={query.search} />
  {#if groups.length}
    <label class="filter">
      {spec.groupLabel}
      <select value={group} onchange={(e) => onsetgroup(e.currentTarget.value)}>
        <option value="">Alle</option>
        {#each groups as g}<option value={g.id}>{g.label}</option>{/each}
      </select>
    </label>
  {/if}
  {#each facets as f (f.id)}
    {#if f.multi}
      <span class="filter">
        {f.label}
        <MultiSelect options={f.options} selected={query.facets[f.id] ?? []} onchange={(ids) => query.setFacet(f.id, ids)} />
      </span>
    {:else}
      <label class="filter">
        {f.label}
        <select value={query.facets[f.id]?.[0] ?? ALL} onchange={(e) => query.setFacet(f.id, e.currentTarget.value === ALL ? [] : [e.currentTarget.value])}>
          <option value={ALL}>Alle</option>
          {#each f.options as o}<option value={o.id}>{o.label}</option>{/each}
        </select>
      </label>
    {/if}
  {/each}
  {#if sortColumns}
    <label class="filter">
      Sortierung
      <select value={sortColumns.active} onchange={(e) => { query.sortCol = e.currentTarget.value; }}>
        <option value="name">Name</option>
        {#each sortColumns.ids as id}<option value={id}>{spec.columns[id].title ?? spec.columns[id].label}</option>{/each}
      </select>
      <button type="button" class="dir" title={query.sortAsc ? 'Aufsteigend' : 'Absteigend'} onclick={() => (query.sortAsc = !query.sortAsc)}>
        {query.sortAsc ? '▲' : '▼'}
      </button>
    </label>
  {/if}
  <span class="count">{count}</span>
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--surface);
  }

  .search {
    flex: 0 1 18rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.85rem;
  }
  .search:focus { outline: none; border-color: var(--red); }

  .filter {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .filter select {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font: inherit;
  }

  .count {
    margin-left: auto;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }

  .dir {
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0 0.2rem;
  }
  .dir:hover { color: var(--red); }
</style>
