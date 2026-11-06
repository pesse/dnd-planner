<script lang="ts">
  import { untrack } from 'svelte';
  import { activeFile, vaultVersion } from '../../stores/campaign';
  import { navigateTo } from '../../services/navigation';
  import { CatalogFilterState } from './catalogFilterState.svelte';
  import { CATALOGS } from '../../services/catalog/catalogs';
  import {
    catalogEntry, columnsFor, crossRefNote, facetOptions,
    type CatalogGroup, type CatalogKind, type CatalogLayout, type CatalogRow,
  } from '../../services/catalog/catalogTypes';
  import { queryRows } from '../../services/catalog/queryRows';
  import SegmentedToggle from '../ui/SegmentedToggle.svelte';
  import CatalogFilterBar from './CatalogFilterBar.svelte';
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

  let groupRows = $derived(group ? rows.filter((r) => r.group === group) : rows);

  let shown = $derived(queryRows(groupRows, filt, activeSort));
  const note = (row: CatalogRow) => crossRefNote(row, filt.facets);

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
    const { [views.facet]: [nextGroupId] = [], ...facets } = filt.facets;
    if (group) facets[next.facet] = [group];
    const nextGroup = nextGroupId ? facetOptions(rows, views.facet).find((o) => o.id === nextGroupId) : undefined;
    void navigateTo(catalogEntry(target, CATALOGS[target].label, nextGroup), {
      state: { catalog: { ...filt.snapshot(), facets } },
    });
  }

  const entryOf = (row: CatalogRow) => ({ name: row.entryName, path: row.path, type: spec.type, dirPath: row.dirPath });
  const open = (row: CatalogRow) => void navigateTo(entryOf(row));

  let layout = $derived(spec.textOnly ? 'table' : filt.layout);

  const LAYOUTS: { id: CatalogLayout; label: string }[] = [{ id: 'table', label: 'Tabelle' }, { id: 'gallery', label: 'Galerie' }];
</script>

<div class="toolbar">
  <span class="catalog-title">{$activeFile?.name ?? spec.label}</span>
</div>

<div class="catalog">
  <CatalogFilterBar
    {spec}
    query={filt}
    {groups}
    {group}
    {groupRows}
    count={loading ? 'Laden…' : `${shown.length} von ${rows.length}`}
    sortColumns={layout === 'gallery' ? { ids: columnIds, active: activeSort } : undefined}
    onsetgroup={setGroup}
  >
    {#snippet lead()}
      {#if !spec.textOnly}
        <span class="views"><SegmentedToggle options={LAYOUTS} value={filt.layout} onselect={(l) => (filt.layout = l)} /></span>
      {/if}
      {#if viewOptions.length}
        <span class="views"><SegmentedToggle options={viewOptions} value={kind} onselect={switchView} /></span>
      {/if}
    {/snippet}
  </CatalogFilterBar>

  {#if layout === 'gallery'}
    <CatalogGallery {spec} rows={shown} showGroup={!group} {groupLabel} {loading} {entryOf} onopen={open} {note} />
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
      {note}
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

  .views { font-size: 0.8rem; }
</style>
