<script lang="ts">
  import { tick } from 'svelte';
  import { activeFile } from '../../stores/campaign';
  import { historyScroll } from '../../utils/historyScroll';
  import type { CatalogRow, CatalogSpec } from '../../services/catalog/catalogTypes';
  import type { FileEntry } from '../../types';
  import GallerySpotlight, { type GalleryImage } from './GallerySpotlight.svelte';

  let { spec, rows, showGroup, groupLabel, loading, entryOf, onopen }: {
    spec: CatalogSpec;
    rows: CatalogRow[];
    showGroup: boolean;
    groupLabel: (id: string) => string;
    loading: boolean;
    entryOf: (row: CatalogRow) => FileEntry;
    onopen: (row: CatalogRow) => void;
  } = $props();

  let failed = $state<Record<string, true>>({});
  let tiles: Record<string, HTMLElement> = {};

  /** Stimmungsbilder vor Symbol; was nicht lädt, fällt weg. Die Kachel zeigt das erste. */
  function imagesOf(row: CatalogRow): GalleryImage[] {
    const art = (row.art ?? []).map((url) => ({ url, art: true }));
    const icon = row.icon && !row.art?.includes(row.icon) ? [{ url: row.icon, art: false }] : [];
    return [...art, ...icon].filter((img) => !failed[img.url]);
  }

  /** Hochformat-Kacheln, sobald der Katalog überhaupt Stimmungsbilder kennt — gemischte Höhen zerreißen das Raster. */
  let tall = $derived(rows.some((r) => r.art?.length));

  /** Am Pfad statt am Index: ein Filterwechsel darf die Auswahl nicht auf einen anderen Eintrag schieben. */
  let selected = $state<string | null>(null);
  let origin = $state<DOMRect | null>(null);
  let index = $derived(selected ? rows.findIndex((r) => r.path === selected) : -1);

  function show(row: CatalogRow, from: HTMLElement | null) {
    origin = from?.querySelector('.frame')?.getBoundingClientRect() ?? null;
    selected = row.path;
  }

  async function step(delta: number) {
    if (!rows.length) return;
    const next = index < 0 ? (delta > 0 ? 0 : rows.length - 1) : (index + delta + rows.length) % rows.length;
    const opening = index < 0;
    const row = rows[next];
    if (opening) {
      tiles[row.path]?.scrollIntoView({ block: 'nearest' });
      await tick();
      show(row, tiles[row.path] ?? null);
    } else {
      origin = null;
      selected = row.path;
      tiles[row.path]?.scrollIntoView({ block: 'nearest' });
    }
  }

  function close() {
    const path = selected;
    selected = null;
    if (path) tiles[path]?.focus({ preventScroll: true });
  }

  const editable = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || editable(e.target)) return;
    // Ein anderer Dialog (Vorschau, Anlegen) hat die Tastatur.
    if (document.querySelector('[role="dialog"]:not(.spotlight)')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      void step(e.key === 'ArrowRight' ? 1 : -1);
    } else if (index >= 0 && e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (index >= 0 && e.key === 'Enter') {
      e.preventDefault();
      onopen(rows[index]);
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="gallery-wrap" use:historyScroll>
  <div class="grid" class:tall>
    {#each rows as row (row.path)}
      {@const img = imagesOf(row)[0]}
      <button
        type="button"
        class="tile"
        class:active={$activeFile?.path === row.path}
        class:selected={row.path === selected}
        style="--ic:{row.iconColor}"
        bind:this={tiles[row.path]}
        onclick={(e) => show(row, e.currentTarget)}
        ondblclick={() => onopen(row)}
      >
        <span class="frame" class:art={img?.art} class:portrait={spec.portraits}>
          {#if img}
            <img src={img.url} alt="" loading="lazy" onerror={() => (failed[img.url] = true)} />
          {:else}
            <span class="initial">{row.name.charAt(0)}</span>
          {/if}
        </span>
        <span class="caption">
          <span class="name">{row.name}</span>
          {#if showGroup}<span class="group">{groupLabel(row.group)}</span>{/if}
        </span>
      </button>
    {:else}
      {#if !loading}<p class="empty">Keine Treffer</p>{/if}
    {/each}
  </div>
</div>

{#if index >= 0}
  <GallerySpotlight
    row={rows[index]}
    entry={entryOf(rows[index])}
    images={imagesOf(rows[index])}
    position={`${index + 1} / ${rows.length}`}
    {origin}
    onclose={close}
    onstep={(d) => void step(d)}
    onopen={() => onopen(rows[index])}
  />
{/if}

<style>
  .gallery-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1rem;
  }

  .grid {
    --tile: 7.5rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--tile), 1fr));
    gap: 1rem 0.75rem;
  }
  .grid.tall { --tile: 9.5rem; }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: center;
    cursor: zoom-in;
    content-visibility: auto;
    contain-intrinsic-size: auto var(--tile);
  }

  .frame {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border-radius: 6px;
    background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--ic) 14%, var(--bg-raised)), var(--bg-raised) 70%);
    border: 1px solid var(--surface);
    overflow: hidden;
    transition: transform 160ms ease-out, box-shadow 160ms ease-out, border-color 160ms;
  }
  .tall .frame { aspect-ratio: 2 / 3; }
  .frame img {
    width: 78%;
    height: 78%;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px color-mix(in srgb, var(--ic) 45%, transparent));
  }
  .frame.art img, .frame.portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    filter: none;
  }
  .initial {
    font-family: var(--font-display);
    font-size: 2.2rem;
    color: color-mix(in srgb, var(--ic) 55%, var(--ink-faint));
  }

  .tile:hover .frame, .tile:focus-visible .frame {
    transform: translateY(-3px) scale(1.04);
    border-color: var(--ic);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--ink) 22%, transparent);
  }
  .tile:focus-visible { outline: none; }
  .tile.active .frame { border-color: var(--red); }
  .tile.selected .frame { visibility: hidden; }

  .caption {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .name {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .tile:hover .name { color: var(--red); }
  .group {
    font-size: 0.7rem;
    color: var(--ink-faint);
  }

  .empty {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--ink-muted);
    padding: 1.5rem;
  }
</style>
