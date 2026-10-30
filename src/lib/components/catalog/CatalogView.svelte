<script lang="ts">
  import { untrack } from 'svelte';
  import { activeFile, vaultVersion } from '../../stores/campaign';
  import { navigateTo } from '../../services/navigation';
  import { peekEntry } from '../../services/entryPeek';
  import { CATALOGS } from '../../services/catalog/catalogs';
  import {
    catalogEntry, columnsFor, facetOptions, facetValues,
    type CatalogColumn, type CatalogGroup, type CatalogKind, type CatalogRow,
  } from '../../services/catalog/catalogTypes';
  import SegmentedToggle from '../ui/SegmentedToggle.svelte';
  import '../toolbar.css';

  let { kind, group }: { kind: CatalogKind; group: string } = $props();

  const spec = $derived(CATALOGS[kind]);
  /** Die Prop hängt am `catalog`-Objekt des Elternteils, das jeder Gruppenwechsel neu baut — erst das Memo hält die Effekte unten still. */
  const currentKind = $derived(kind);

  /** Die Zeilen tragen ihren Katalog: nach einem Wechsel passen die alten nicht auf die neuen Spalten. */
  let loaded = $state<{ kind: CatalogKind; rows: CatalogRow[]; groups: CatalogGroup[] } | null>(null);
  let rows = $derived(loaded?.kind === kind ? loaded.rows : []);
  let groups = $derived(loaded?.kind === kind ? loaded.groups : []);
  let loading = $state(true);
  let search = $state('');
  /** Spalten-ID oder `name`; überlebt den Filterwechsel, solange das neue Set die Spalte zeigt. */
  let sortCol = $state('name');
  let sortAsc = $state(true);
  let failedIcons = $state<Record<string, true>>({});

  async function load(fresh: boolean) {
    const forKind = kind;
    if (fresh) spec.invalidate();
    const result = await spec.load();
    if (forKind !== kind) return;
    loaded = { kind: forKind, ...result };
    loading = false;
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

  /** Vom Ansichtswechsel (`switchView`) für den nächsten Katalog hinterlegt. */
  let carry: { facets: Record<string, string>; search: string } | null = null;

  // Wechsel zwischen den Katalogen: die Sortierung des anderen passt nicht auf diese Spalten.
  // Nur ein Ansichtswechsel zeigt dieselben Zeilen und behält Suche und Sortierung.
  $effect(() => {
    void currentKind;
    untrack(() => {
      const kept = carry;
      carry = null;
      if (!kept) { sortCol = 'name'; sortAsc = true; }
      search = kept?.search ?? '';
      facetSel = kept?.facets ?? {};
      loading = true;
    });
  });

  const groupLabel = (id: string) => groups.find((g) => g.id === id)?.label ?? id;

  let columnIds = $derived(columnsFor(spec, group));
  let activeSort = $derived(columnIds.includes(sortCol) ? sortCol : 'name');

  /** Facette → gewählter Wert; fehlt der Schlüssel, filtert sie nicht. */
  let facetSel = $state<Record<string, string>>({});
  const ALL = '*';

  let groupRows = $derived(group ? rows.filter((r) => r.group === group) : rows);

  // Eine Facette mit nur einem Wert in dieser Gruppe filtert nichts und bleibt weg.
  let facets = $derived(
    Object.entries(spec.facets)
      .map(([id, label]) => ({ id, label, options: facetOptions(groupRows, id) }))
      .filter((f) => f.options.length > 1 || f.id in facetSel),
  );

  function setFacet(id: string, value: string) {
    if (value === ALL) delete facetSel[id];
    else facetSel[id] = value;
  }

  let shown = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const filtered = groupRows.filter((r) =>
      Object.entries(facetSel).every(([id, value]) => facetValues(r, id).some((v) => v.id === value))
      && (!q || r.name.toLowerCase().includes(q) || !!r.altName?.toLowerCase().includes(q)));
    const key = (r: CatalogRow): string | number =>
      activeSort === 'name' ? r.name : (r.cells[activeSort].sort ?? r.cells[activeSort].text);
    const dir = sortAsc ? 1 : -1;
    return filtered.sort((a, b) => {
      const ka = key(a), kb = key(b);
      const c = typeof ka === 'number' && typeof kb === 'number'
        ? ka - kb
        : String(ka).localeCompare(String(kb), 'de');
      return c * dir || a.name.localeCompare(b.name, 'de');
    });
  });

  function sortBy(col: string) {
    if (activeSort === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = true; }
  }

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
    const { [views.facet]: nextGroupId, ...facets } = facetSel;
    if (group) facets[next.facet] = group;
    carry = { facets, search };
    const nextGroup = nextGroupId ? facetOptions(rows, views.facet).find((o) => o.id === nextGroupId) : undefined;
    void navigateTo(catalogEntry(target, CATALOGS[target].label, nextGroup));
  }

  const entryOf = (row: CatalogRow) => ({ name: row.entryName, path: row.path, type: spec.type, dirPath: row.dirPath });
</script>

{#snippet sortHead(label: string, col: string, def: CatalogColumn = {} as CatalogColumn)}
  <th class:numeric={def.numeric} class:center={def.center} aria-sort={activeSort === col ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
    <button type="button" title={def.title} onclick={() => sortBy(col)}>
      {label}<span class="sort-mark">{activeSort === col ? (sortAsc ? '▲' : '▼') : ''}</span>
    </button>
  </th>
{/snippet}

<div class="toolbar">
  <span class="catalog-title">{$activeFile?.name ?? spec.label}</span>
</div>

<div class="catalog">
  <div class="controls">
    {#if viewOptions.length}
      <span class="views"><SegmentedToggle options={viewOptions} value={kind} onselect={switchView} /></span>
    {/if}
    <input class="search" type="search" placeholder="Suchen…" bind:value={search} />
    <label class="filter">
      {spec.groupLabel}
      <select value={group} onchange={(e) => setGroup(e.currentTarget.value)}>
        <option value="">Alle</option>
        {#each groups as g}<option value={g.id}>{g.label}</option>{/each}
      </select>
    </label>
    {#each facets as f (f.id)}
      <label class="filter">
        {f.label}
        <select value={facetSel[f.id] ?? ALL} onchange={(e) => setFacet(f.id, e.currentTarget.value)}>
          <option value={ALL}>Alle</option>
          {#each f.options as o}<option value={o.id}>{o.label}</option>{/each}
        </select>
      </label>
    {/each}
    <span class="count">{loading ? 'Laden…' : `${shown.length} von ${rows.length}`}</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="icon-col"></th>
          {@render sortHead('Name', 'name')}
          {#each columnIds as id}{@render sortHead(spec.columns[id].label, id, spec.columns[id])}{/each}
        </tr>
      </thead>
      <tbody>
        {#each shown as row (row.path)}
          <tr class:active={$activeFile?.path === row.path} onclick={() => navigateTo(entryOf(row))}>
            <td class="icon-col">
              {#if row.icon && !failedIcons[row.path]}
                <button
                  type="button"
                  class="icon"
                  style="--ic:{row.iconColor}"
                  title="Vorschau"
                  onclick={(e) => { e.stopPropagation(); peekEntry(entryOf(row)); }}
                >
                  <img src={row.icon} alt="" loading="lazy" onerror={() => (failedIcons[row.path] = true)} />
                </button>
              {/if}
            </td>
            <td class="name">
              {row.name}
              {#if !group}<span class="group">{groupLabel(row.group)}</span>{/if}
            </td>
            {#each columnIds as id}
              {@const cell = row.cells[id]}
              {@const col = spec.columns[id]}
              <td
                class:numeric={col.numeric}
                class:wrap={col.wrap}
                class:center={col.center}
                title={cell.title}
                style={cell.color && !col.badge ? `color:${cell.color}` : undefined}
              >
                {#if col.badge}
                  <span class="badge" style:background={cell.color}>{cell.text}</span>
                {:else}{cell.text}{/if}
              </td>
            {/each}
          </tr>
        {:else}
          {#if !loading}
            <tr><td class="empty" colspan={columnIds.length + 2}>Keine Treffer</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
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

  .table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    text-align: left;
    padding: 0;
  }
  th button {
    width: 100%;
    background: none;
    border: none;
    padding: 0.4rem 0.6rem;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-soft);
    text-align: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  th button:hover { color: var(--red); }
  .sort-mark {
    display: inline-block;
    width: 1em;
    font-size: 0.65rem;
    margin-left: 0.2rem;
  }

  td {
    padding: 0.2rem 0.6rem;
    border-bottom: 1px solid var(--surface);
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .numeric { text-align: right; font-variant-numeric: tabular-nums; }
  td.wrap { white-space: normal; min-width: 10rem; }
  .center { text-align: center; }
  td.center { font-weight: 700; }

  .badge {
    display: inline-block;
    min-width: 1.2rem;
    padding: 0 0.35rem;
    border-radius: 0.25rem;
    color: var(--bg);
    font-size: 0.75rem;
    font-weight: 700;
    text-align: center;
    line-height: 1.25rem;
  }

  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--bg-raised); }
  tbody tr.active { background: var(--surface); }

  td.name {
    color: var(--ink);
    font-weight: 500;
    white-space: normal;
    width: 100%;
  }
  .group {
    margin-left: 0.5rem;
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--ink-faint);
  }

  .icon-col { width: 40px; padding: 0.15rem 0.3rem 0.15rem 0.8rem; }
  .icon {
    display: block;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
    filter: drop-shadow(0 1px 3px color-mix(in srgb, var(--ic) 45%, transparent));
  }
  .icon img { display: block; width: 100%; height: 100%; }

  .empty {
    text-align: center;
    color: var(--ink-muted);
    padding: 1.5rem;
  }
</style>
