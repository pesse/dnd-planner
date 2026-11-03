<script lang="ts" module>
  export interface GalleryImage {
    url: string;
    /** Stimmungsbild (füllt die Fläche) statt freigestelltem Symbol. */
    art: boolean;
  }
</script>

<script lang="ts">
  import { fade } from 'svelte/transition';
  import EntryCard from '../ui/EntryCard.svelte';
  import ArtPicker from '../ui/ArtPicker.svelte';
  import type { CatalogRow } from '../../services/catalog/catalogTypes';
  import type { FileEntry } from '../../types';

  let { row, entry, images, position, origin, onclose, onstep, onopen, openLabel = 'Öffnen' }: {
    row: CatalogRow;
    entry: FileEntry;
    images: GalleryImage[];
    /** „12 / 340" */
    position: string;
    /** Rahmen der Kachel, aus der das Bild herauswächst; `null` beim Blättern. */
    origin: DOMRect | null;
    onclose: () => void;
    onstep: (delta: number) => void;
    onopen: () => void;
    openLabel?: string;
  } = $props();

  let figure = $state<HTMLElement>();
  let shown = $state(0);
  let wrapped = $state(false);
  let col = $state<HTMLElement>();
  /** Nach einem Bildwechsel blendet `{#key}` über, statt erneut aus der Kachel zu wachsen. */
  let switched = $state(false);
  $effect.pre(() => {
    void row.path;
    shown = 0;
    switched = false;
  });

  function pick(i: number) {
    shown = i;
    switched = true;
  }

  let current = $derived(Math.min(shown, images.length - 1));
  let image = $derived(images[current] ?? null);

  // Nur beim Öffnen: das Bild wächst aus seiner Kachel. Danach blendet `{#key}` beim Blättern über.
  $effect(() => {
    if (!figure || !origin || switched) return;
    const to = figure.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const dx = origin.left + origin.width / 2 - (to.left + to.width / 2);
    const dy = origin.top + origin.height / 2 - (to.top + to.height / 2);
    const s = Math.min(origin.width / to.width, origin.height / to.height);
    figure.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  });
</script>

<div class="spotlight" role="dialog" aria-label={row.name} transition:fade={{ duration: 160 }}>
  <div class="backdrop" role="presentation" onclick={onclose}></div>

  <button type="button" class="nav prev" title="Vorheriges (←)" onclick={() => onstep(-1)}>‹</button>

  <div class="stage">
    <div class="figure-col" bind:this={col}>
      {#if images.length > 1}
        <div class="picker" class:overlay={wrapped}>
          <ArtPicker count={images.length} index={current} onpick={pick} area={col} bind:wrapped />
        </div>
      {/if}
      {#key `${row.path}|${image?.url}`}
        <button
          type="button"
          class="figure"
          class:art={image?.art}
          style="--ic:{row.iconColor}"
          title={openLabel}
          bind:this={figure}
          onclick={onopen}
          in:fade={{ duration: origin && !switched ? 0 : 140 }}
        >
          {#if image}
            <img src={image.url} alt="" />
          {:else}
            <span class="initial">{row.name.charAt(0)}</span>
          {/if}
        </button>
      {/key}
    </div>

    <aside class="info">
      <div class="card">
        {#key entry.path}<EntryCard {entry} />{/key}
      </div>

      <footer>
        <button type="button" class="open" onclick={onopen}>{openLabel} ↵</button>
        <span class="position">{position}</span>
      </footer>
    </aside>
  </div>

  <button type="button" class="nav next" title="Nächstes (→)" onclick={() => onstep(1)}>›</button>
  <button type="button" class="close" title="Schließen (Esc)" onclick={onclose}>✕</button>
</div>

<style>
  .spotlight {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 3.5rem;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    backdrop-filter: blur(6px);
  }

  .stage {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2rem;
    max-width: 100%;
    max-height: 100%;
    min-height: 0;
  }

  .figure-col {
    position: relative;
    flex: none;
  }

  .picker {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 0;
    right: 0;
    z-index: 1;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .picker.overlay { bottom: auto; top: 0.6rem; left: 0.6rem; right: 0.6rem; }

  .figure {
    display: grid;
    place-items: center;
    width: min(60vh, 42vw);
    aspect-ratio: 1;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--ic) 18%, var(--bg-raised)), var(--bg-raised) 70%);
    box-shadow: 0 18px 48px color-mix(in srgb, var(--ink) 30%, transparent);
    overflow: hidden;
    cursor: pointer;
  }
  .figure.art {
    width: auto;
    height: min(78vh, 900px);
    aspect-ratio: 2 / 3;
  }
  .figure img {
    width: 82%;
    height: 82%;
    object-fit: contain;
    filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--ic) 45%, transparent));
  }
  .figure.art img { width: 100%; height: 100%; object-fit: cover; filter: none; }
  .initial {
    font-family: var(--font-display);
    font-size: 8rem;
    color: color-mix(in srgb, var(--ic) 55%, var(--ink-faint));
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: min(34rem, 40vw);
    height: min(78vh, 900px);
    padding: 0.6rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px color-mix(in srgb, var(--ink) 18%, transparent);
  }

  .card {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    border-radius: 6px;
    background: var(--bg);
  }
  .card > :global(*) { max-width: none; }

  footer { display: flex; align-items: center; justify-content: space-between; }
  .open {
    background: var(--red);
    color: var(--on-accent);
    border: none;
    border-radius: 4px;
    padding: 0.35rem 0.9rem;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .open:hover { background: var(--red-bright); }
  .position { font-size: 0.75rem; color: var(--ink-muted); font-variant-numeric: tabular-nums; }

  .nav, .close {
    position: absolute;
    border: none;
    background: none;
    color: var(--ink-soft);
    cursor: pointer;
    font: inherit;
  }
  .nav { top: 50%; translate: 0 -50%; font-size: 3rem; padding: 0.5rem 0.9rem; line-height: 1; }
  .prev { left: 0.25rem; }
  .next { right: 0.25rem; }
  .close { top: 0.6rem; right: 0.9rem; font-size: 1.1rem; }
  .nav:hover, .close:hover { color: var(--red); }
</style>
