<script lang="ts">
  import { activeFile } from '../../stores/campaign';
  import { historyScroll } from '../../utils/historyScroll';
  import type { CatalogColumn, CatalogRow, CatalogSpec } from '../../services/catalog/catalogTypes';
  import type { FileEntry } from '../../types';
  import GallerySpotlight from './GallerySpotlight.svelte';
  import { CatalogSpotlight, catalogImages } from './catalogSpotlight.svelte';

  let { spec, rows, columnIds, showGroup, groupLabel, activeSort, sortAsc, loading, entryOf, onsort, onopen }: {
    spec: CatalogSpec;
    rows: CatalogRow[];
    columnIds: string[];
    showGroup: boolean;
    groupLabel: (id: string) => string;
    activeSort: string;
    sortAsc: boolean;
    loading: boolean;
    onsort: (col: string) => void;
    entryOf: (row: CatalogRow) => FileEntry;
    onopen: (row: CatalogRow) => void;
  } = $props();

  let failed = $state<Record<string, true>>({});
  const spot = new CatalogSpotlight(() => rows, (row) => onopen(row), false);
</script>

<svelte:window onkeydown={spot.onkeydown} />

{#snippet sortHead(label: string, col: string, def: CatalogColumn = {} as CatalogColumn)}
  <th class:numeric={def.numeric} class:center={def.center} aria-sort={activeSort === col ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
    <button type="button" title={def.title} onclick={() => onsort(col)}>
      {label}<span class="sort-mark">{activeSort === col ? (sortAsc ? '▲' : '▼') : ''}</span>
    </button>
  </th>
{/snippet}

<div class="table-wrap" use:historyScroll>
  <table>
    <thead>
      <tr>
        <th class="icon-col"></th>
        {@render sortHead('Name', 'name')}
        {#each columnIds as id}{@render sortHead(spec.columns[id].label, id, spec.columns[id])}{/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.path)}
        <tr class:active={$activeFile?.path === row.path} onclick={() => onopen(row)}>
          <td class="icon-col">
            {#if row.icon && !failed[row.icon]}
              <button
                type="button"
                class="icon"
                class:portrait={spec.portraits}
                style="--ic:{row.iconColor}"
                class:selected={row.path === spot.selected}
                title="Vorschau"
                bind:this={spot.anchors[row.path]}
                onclick={(e) => { e.stopPropagation(); spot.show(row, e.currentTarget); }}
              >
                <img src={row.icon} alt="" loading="lazy" onerror={() => row.icon && (failed[row.icon] = true)} />
              </button>
            {/if}
          </td>
          <td class="name">
            {row.name}
            {#if showGroup}<span class="group">{groupLabel(row.group)}</span>{/if}
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

{#if spot.index >= 0}
  {@const row = rows[spot.index]}
  <GallerySpotlight
    {row}
    entry={entryOf(row)}
    images={catalogImages(row, failed)}
    position={`${spot.index + 1} / ${rows.length}`}
    origin={spot.origin}
    onclose={() => spot.close()}
    onstep={(d) => void spot.step(d)}
    onopen={() => onopen(row)}
  />
{/if}

<style>
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
  .icon.selected { visibility: hidden; }
  .icon img { display: block; width: 100%; height: 100%; }
  .icon.portrait { height: 40px; filter: none; }
  .icon.portrait img {
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--ic);
    box-sizing: border-box;
  }

  .empty {
    text-align: center;
    color: var(--ink-muted);
    padding: 1.5rem;
  }
</style>
