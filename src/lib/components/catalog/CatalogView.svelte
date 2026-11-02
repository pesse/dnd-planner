<script lang="ts">
  import { untrack } from 'svelte';
  import { activeFile, vaultVersion } from '../../stores/campaign';
  import { navigateTo } from '../../services/navigation';
  import { CatalogFilterState } from './catalogFilterState.svelte';
  import { CATALOGS } from '../../services/catalog/catalogs';
  import {
    catalogEntry, columnsFor, facetOptions, facetValues,
    type CatalogGroup, type CatalogKind, type CatalogLayout, type CatalogRow,
  } from '../../services/catalog/catalogTypes';
  import SegmentedToggle from '../ui/SegmentedToggle.svelte';
  import CatalogTable from './CatalogTable.svelte';
  import CatalogGallery from './CatalogGallery.svelte';
  import '../toolbar.css';

  let { kind, group }: { kind: CatalogKind; group: string } = $props();

  const spec = $derived(CATALOGS[kind]);
  /** Die Props hängen am `catalog`-Objekt des Elternteils, das jede Navigation neu baut — erst das Memo hält die Effekte unten still. */
  const currentKind = $derived(kind);
  const currentGroup = $derived(group);

  /** Die Zeilen tragen ihren Katalog: nach einem Wechsel passen die alten nicht auf die neuen Spalten. */
  let loaded = $state<{ kind: CatalogKind; rows: CatalogRow[]; groups: CatalogGroup[] } | null>(null);
  let rows = $derived(loaded?.kind === kind ? loaded.rows : []);
  let groups = $derived(loaded?.kind === kind ? loaded.groups : []);
  let loading = $derived(loaded?.kind !== kind);

  async function load(fresh: boolean) {
    const forKind = kind;
    if (fresh) spec.invalidate();
    const result = await spec.load();
    if (forKind !== kind) return;
    loaded = { kind: forKind, ...result };
  }

  let loadedVersion = -1;
  $effect(() => {
    const v = $vaultVersion;
    void currentKind;
    untrack(() => {
      void load(loadedVersion !== -1 && loadedVersion !== v);
      loadedVersion = v;
    });
  });

  const filt = new CatalogFilterState(() => currentKind, () => currentGroup);

  const groupLabel = (id: string) => groups.find((g) => g.id === id)?.label ?? id;

  let columnIds = $derived(columnsFor(spec, group));
  let activeSort = $derived(columnIds.includes(filt.sortCol) ? filt.sortCol : 'name');

  const ALL = '*';

  let groupRows = $derived(group ? rows.filter((r) => r.group === group) : rows);

  // Eine Facette mit nur einem Wert in dieser Gruppe filtert nichts und bleibt weg.
  let facets = $derived(
    Object.entries(spec.facets)
      .map(([id, label]) => ({ id, label, options: facetOptions(groupRows, id) }))
      .filter((f) => f.options.length > 1 || f.id in filt.facets),
  );

  let shown = $derived.by(() => {
    const q = filt.search.trim().toLowerCase();
    const filtered = groupRows.filter((r) =>
      Object.entries(filt.facets).every(([id, value]) => facetValues(r, id).some((v) => v.id === value))
      && (!q || r.name.toLowerCase().includes(q) || !!r.altName?.toLowerCase().includes(q)));
    const key = (r: CatalogRow): string | number =>
      activeSort === 'name' ? r.name : (r.cells[activeSort].sort ?? r.cells[activeSort].text);
    const dir = filt.sortAsc ? 1 : -1;
    return filtered.sort((a, b) => {
      const ka = key(a), kb = key(b);
      const c = typeof ka === 'number' && typeof kb === 'number'
        ? ka - kb
        : String(ka).localeCompare(String(kb), 'de');
      return c * dir || a.name.localeCompare(b.name, 'de');
    });
  });

  function setGroup(id: string) {
    const g = groups.find((x) => x.id === id);
    void navigateTo(catalogEntry(kind, spec.label, g));
  }

  let viewOptions = $derived(spec.views?.kinds.map((k) => ({ id: k, label: CATALOGS[k].groupLabel })) ?? []);

  /** Gruppe und `views.facet` tauschen die Rollen: „Hervorrufung + Grad 3" wird „Grad 3 + Hervorrufung". */
  function switchView(target: CatalogKind) {
    const views = spec.views;
    const next = CATALOGS[target].views;
    if (!views || !next || target === kind) return;
    const { [views.facet]: nextGroupId, ...facets } = filt.facets;
    if (group) facets[next.facet] = group;
    const nextGroup = nextGroupId ? facetOptions(rows, views.facet).find((o) => o.id === nextGroupId) : undefined;
    void navigateTo(catalogEntry(target, CATALOGS[target].label, nextGroup), {
      state: { catalog: { ...filt.snapshot(), facets } },
    });
  }

  const entryOf = (row: CatalogRow) => ({ name: row.entryName, path: row.path, type: spec.type, dirPath: row.dirPath });
  const open = (row: CatalogRow) => void navigateTo(entryOf(row));

  const LAYOUTS: { id: CatalogLayout; label: string }[] = [{ id: 'table', label: 'Tabelle' }, { id: 'gallery', label: 'Galerie' }];
</script>

<div class="toolbar">
  <span class="catalog-title">{$activeFile?.name ?? spec.label}</span>
</div>

<div class="catalog">
  <div class="controls">
    <span class="views"><SegmentedToggle options={LAYOUTS} value={filt.layout} onselect={(l) => (filt.layout = l)} /></span>
    {#if viewOptions.length}
      <span class="views"><SegmentedToggle options={viewOptions} value={kind} onselect={switchView} /></span>
    {/if}
    <input class="search" type="search" placeholder="Suchen…" bind:value={filt.search} />
    {#if groups.length}
      <label class="filter">
        {spec.groupLabel}
        <select value={group} onchange={(e) => setGroup(e.currentTarget.value)}>
          <option value="">Alle</option>
          {#each groups as g}<option value={g.id}>{g.label}</option>{/each}
        </select>
      </label>
    {/if}
    {#each facets as f (f.id)}
      <label class="filter">
        {f.label}
        <select value={filt.facets[f.id] ?? ALL} onchange={(e) => filt.setFacet(f.id, e.currentTarget.value === ALL ? null : e.currentTarget.value)}>
          <option value={ALL}>Alle</option>
          {#each f.options as o}<option value={o.id}>{o.label}</option>{/each}
        </select>
      </label>
    {/each}
    {#if filt.layout === 'gallery'}
      <label class="filter">
        Sortierung
        <select value={activeSort} onchange={(e) => { filt.sortCol = e.currentTarget.value; }}>
          <option value="name">Name</option>
          {#each columnIds as id}<option value={id}>{spec.columns[id].title ?? spec.columns[id].label}</option>{/each}
        </select>
        <button type="button" class="dir" title={filt.sortAsc ? 'Aufsteigend' : 'Absteigend'} onclick={() => (filt.sortAsc = !filt.sortAsc)}>
          {filt.sortAsc ? '▲' : '▼'}
        </button>
      </label>
    {/if}
    <span class="count">{loading ? 'Laden…' : `${shown.length} von ${rows.length}`}</span>
  </div>

  {#if filt.layout === 'gallery'}
    <CatalogGallery {spec} rows={shown} showGroup={!group} {groupLabel} {loading} {entryOf} onopen={open} />
  {:else}
    <CatalogTable
      {spec}
      rows={shown}
      {columnIds}
      showGroup={!group}
      {groupLabel}
      {activeSort}
      sortAsc={filt.sortAsc}
      {loading}
      {entryOf}
      onsort={(col) => filt.sortBy(col, activeSort)}
      onopen={open}
    />
  {/if}
</div>

<style>
  .catalog-title {
    font-family: var(--font-display);
    color: var(--ink);
    font-size: 1rem;
    padding: 0.2rem 0;
  }

  .catalog {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--bg);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--surface);
  }

  .views { font-size: 0.8rem; }

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
