<script lang="ts">
  /** Ein Katalog als Auswahlliste neben dem Panel: ein Klick auf eine Zeile wählt, statt zu navigieren. Bleibt für weitere Wahlen offen.
   *  Geschlossen bleibt sie aufgebaut — Filter und Scrollposition überleben so das Wiederöffnen. */
  import { CATALOGS } from '../../services/catalog/catalogs';
  import { columnsFor, type CatalogGroup, type CatalogKind, type CatalogRow } from '../../services/catalog/catalogTypes';
  import { queryRows } from '../../services/catalog/queryRows';
  import { CatalogQuery } from './catalogFilterState.svelte';
  import CatalogFilterBar from './CatalogFilterBar.svelte';
  import CatalogTable from './CatalogTable.svelte';
  import CatalogRowTooltip from './CatalogRowTooltip.svelte';
  import type { Snippet } from 'svelte';
  import { createHoverTip } from '../../utils/hoverTip.svelte';

  let { kind, title, columns, extraRows = [], open, side, count, ondecrement, tip, onpick, onclose }: {
    kind: CatalogKind;
    title: string;
    /** Ersetzt das Spaltenset des Katalogs — zum Auswählen reicht meist der Name. */
    columns?: string[];
    /** Stehen vorn und verdrängen Katalogzeilen gleichen Eintragsnamens. */
    extraRows?: CatalogRow[];
    open: boolean;
    /** Auf welcher Seite ihres Panels sie über die Karte fährt; das Panel bleibt frei. */
    side: 'left' | 'right';
    /** Gewählte Zeilen stehen oben. */
    count?: (row: CatalogRow) => number;
    ondecrement?: (row: CatalogRow) => void;
    /** Schwebe-Tooltip über dem Icon; ohne ihn zeigt er die Spalten der Zeile. */
    tip?: Snippet<[{ row: CatalogRow | null; x: number; y: number }]>;
    onpick: (row: CatalogRow) => void;
    onclose: () => void;
  } = $props();

  const spec = $derived(CATALOGS[kind]);
  const query = new CatalogQuery();
  let group = $state('');
  let rows = $state<CatalogRow[]>([]);
  let groups = $state<CatalogGroup[]>([]);
  let loading = $state(true);

  $effect(() => {
    const forKind = kind;
    loading = true;
    group = '';
    void CATALOGS[forKind].load().then((result) => {
      if (forKind !== kind) return;
      ({ rows, groups } = result);
      loading = false;
    });
  });

  const groupLabel = (id: string) => groups.find((g) => g.id === id)?.label ?? id;
  let columnIds = $derived(columns ?? columnsFor(spec, group));
  let activeSort = $derived(columnIds.includes(query.sortCol) ? query.sortCol : 'name');
  let allRows = $derived.by(() => {
    const own = new Set(extraRows.map((r) => r.entryName));
    return [...extraRows, ...rows.filter((r) => !own.has(r.entryName))];
  });
  let groupRows = $derived(group ? allRows.filter((r) => r.group === group) : allRows);
  let shown = $derived.by(() => {
    const sorted = queryRows(groupRows, query, activeSort);
    return count ? [...sorted.filter((r) => count(r) > 0), ...sorted.filter((r) => !count(r))] : sorted;
  });
  const hover = createHoverTip<CatalogRow>();
  $effect(() => {
    if (!open) hover.hide();
  });
  const onhover = (e: MouseEvent, row: CatalogRow | null) => (row ? hover.show(e, row) : hover.hide());

  const entryOf = (row: CatalogRow) => ({ name: row.entryName, path: row.path, type: spec.type, dirPath: row.dirPath });

  let section = $state<HTMLElement>();

  function onkeydown(e: KeyboardEvent) {
    // Die Bildvorschau der Tabelle schließt zuerst.
    if (!open || e.key !== 'Escape' || e.defaultPrevented || section?.querySelector('[role="dialog"]')) return;
    e.preventDefault();
    onclose();
  }
</script>

<svelte:window {onkeydown} />

<section bind:this={section} class="drawer {side}" class:closed={!open} inert={!open} aria-label={title}>
  <header>
    <h2>{title}</h2>
    <button class="close" title="Schließen (Esc)" onclick={onclose}>✕</button>
  </header>
  <CatalogFilterBar
    {spec}
    {query}
    {groups}
    {group}
    {groupRows}
    count={loading ? 'Laden…' : `${shown.length} von ${allRows.length}`}
    onsetgroup={(id) => (group = id)}
  />
  <CatalogTable
    {spec}
    rows={shown}
    {columnIds}
    showGroup={!group}
    {groupLabel}
    {activeSort}
    sortAsc={query.sortAsc}
    {loading}
    {entryOf}
    inPage={false}
    openLabel="Einsetzen"
    {count}
    {ondecrement}
    {onhover}
    onsort={(col) => query.sortBy(col, activeSort)}
    onopen={onpick}
  />
</section>

{#if open && tip}
  {@render tip({ row: hover.data, x: hover.x, y: hover.y })}
{:else if open}
  <CatalogRowTooltip row={hover.data} {spec} {groupLabel} x={hover.x} y={hover.y} />
{/if}

<style>
  .drawer {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 20;
    width: min(30rem, 60vw);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    transition: opacity 0.12s, visibility 0.12s;
  }
  .drawer.right {
    left: 100%;
    border-right: 1px solid var(--border);
    box-shadow: 4px 0 16px color-mix(in srgb, var(--ink) 18%, transparent);
  }
  .drawer.left {
    right: 100%;
    border-left: 1px solid var(--border);
    box-shadow: -4px 0 16px color-mix(in srgb, var(--ink) 18%, transparent);
  }
  /* visibility statt display: none — sonst verwirft der Browser die Scrollposition. */
  .closed {
    visibility: hidden;
    opacity: 0;
  }
  header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-bottom: 1px solid var(--surface);
    background: var(--bg-panel);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--ink);
  }
  .close {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0.2rem 0.45rem;
  }
  .close:hover {
    border-color: var(--border);
  }
</style>
