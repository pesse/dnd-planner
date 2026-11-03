<script lang="ts">
  /** Ein Katalog als Auswahlliste neben dem Panel: ein Klick auf eine Zeile wählt, statt zu navigieren. Bleibt für weitere Wahlen offen.
   *  Geschlossen bleibt sie aufgebaut — Filter und Scrollposition überleben so das Wiederöffnen. */
  import { CATALOGS } from '../../services/catalog/catalogs';
  import { columnsFor, type CatalogGroup, type CatalogKind, type CatalogRow } from '../../services/catalog/catalogTypes';
  import { queryRows } from '../../services/catalog/queryRows';
  import { CatalogQuery } from './catalogFilterState.svelte';
  import CatalogFilterBar from './CatalogFilterBar.svelte';
  import CatalogTable from './CatalogTable.svelte';

  let { kind, title, columns, open, anchor, onpick, onclose }: {
    kind: CatalogKind;
    title: string;
    /** Ersetzt das Spaltenset des Katalogs — zum Auswählen reicht meist der Name. */
    columns?: string[];
    open: boolean;
    /** Die Schublade beginnt unter seiner Unterkante. */
    anchor: HTMLElement;
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
  let groupRows = $derived(group ? rows.filter((r) => r.group === group) : rows);
  let shown = $derived(queryRows(groupRows, query, activeSort));

  const entryOf = (row: CatalogRow) => ({ name: row.entryName, path: row.path, type: spec.type, dirPath: row.dirPath });

  let section = $state<HTMLElement>();
  let top = $state(0);

  function place() {
    const base = section?.offsetParent?.getBoundingClientRect().top ?? 0;
    top = anchor.getBoundingClientRect().bottom - base + 6;
  }

  $effect(() => {
    if (open) place();
  });

  function onkeydown(e: KeyboardEvent) {
    // Die Bildvorschau der Tabelle schließt zuerst.
    if (!open || e.key !== 'Escape' || e.defaultPrevented || section?.querySelector('[role="dialog"]')) return;
    e.preventDefault();
    onclose();
  }
</script>

<svelte:window {onkeydown} onresize={() => open && place()} />

<section bind:this={section} class="drawer" class:closed={!open} inert={!open} style:top="{top}px" aria-label={title}>
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
    count={loading ? 'Laden…' : `${shown.length} von ${rows.length}`}
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
    onsort={(col) => query.sortBy(col, activeSort)}
    onopen={onpick}
  />
</section>

<style>
  .drawer {
    position: absolute;
    bottom: 0;
    left: 0;
    z-index: 20;
    width: calc(100% + 14rem);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-top: 1px solid var(--border);
    border-right: 1px solid var(--border);
    transition: opacity 0.12s, visibility 0.12s;
    box-shadow: 4px 0 16px color-mix(in srgb, var(--ink) 18%, transparent);
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
