<script lang="ts">
  import { activeFile } from '../../stores/campaign';
  import { historyScroll } from '../../utils/historyScroll';
  import type { CatalogRow, CatalogSpec } from '../../services/catalog/catalogTypes';
  import type { FileEntry } from '../../types';
  import GallerySpotlight from './GallerySpotlight.svelte';
  import { CatalogSpotlight, catalogImages } from './catalogSpotlight.svelte';

  let { spec, rows, showGroup, groupLabel, loading, entryOf, onopen, note }: {
    spec: CatalogSpec;
    rows: CatalogRow[];
    showGroup: boolean;
    groupLabel: (id: string) => string;
    loading: boolean;
    entryOf: (row: CatalogRow) => FileEntry;
    onopen: (row: CatalogRow) => void;
    note?: (row: CatalogRow) => string | undefined;
  } = $props();

  let failed = $state<Record<string, true>>({});
  const imagesOf = (row: CatalogRow) => catalogImages(row, failed);
  const spot = new CatalogSpotlight(() => rows, (row) => onopen(row), true);

  /** Hochformat-Kacheln, sobald der Katalog überhaupt Stimmungsbilder kennt — gemischte Höhen zerreißen das Raster. */
  let tall = $derived(rows.some((r) => r.art?.length));
</script>

<svelte:window onkeydown={spot.onkeydown} />

<div class="gallery-wrap" use:historyScroll>
  <div class="grid" class:tall>
    {#each rows as row (row.path)}
      {@const img = imagesOf(row)[0]}
      <button
        type="button"
        class="tile"
        class:active={$activeFile?.path === row.path}
        class:selected={row.path === spot.selected}
        style="--ic:{row.iconColor}"
        bind:this={spot.anchors[row.path]}
        onclick={(e) => spot.show(row, e.currentTarget)}
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
          {#if note?.(row)}<span class="note" title="Stammt aus {note(row)}, kommt im gewählten Buch vor">{note(row)}</span>{/if}
          {#if showGroup}<span class="group">{groupLabel(row.group)}</span>{/if}
        </span>
      </button>
    {:else}
      {#if !loading}<p class="empty">Keine Treffer</p>{/if}
    {/each}
  </div>
</div>

{#if spot.index >= 0}
  {@const row = rows[spot.index]}
  <GallerySpotlight
    {row}
    entry={entryOf(row)}
    images={imagesOf(row)}
    position={`${spot.index + 1} / ${rows.length}`}
    origin={spot.origin}
    onclose={() => spot.close()}
    onstep={(d) => void spot.step(d)}
    onopen={() => onopen(row)}
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
  .note {
    align-self: center;
    margin-top: 0.15rem;
    padding: 0 0.3rem;
    border: 1px solid var(--surface);
    border-radius: 0.25rem;
    font-size: 0.65rem;
    color: var(--ink-muted);
  }
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
