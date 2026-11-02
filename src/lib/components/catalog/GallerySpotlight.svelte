<script lang="ts" module>
  export interface GalleryImage {
    url: string;
    /** Stimmungsbild (füllt die Fläche) statt freigestelltem Symbol. */
    art: boolean;
  }
</script>

<script lang="ts">
  import { fade } from 'svelte/transition';
  import Markdown from '../Markdown.svelte';
  import { facetValues, type CatalogRow, type CatalogSpec } from '../../services/catalog/catalogTypes';

  let { spec, row, image, columnIds, group, position, origin, onclose, onstep, onopen }: {
    spec: CatalogSpec;
    row: CatalogRow;
    image: GalleryImage | null;
    columnIds: string[];
    group: string;
    /** „12 / 340" */
    position: string;
    /** Rahmen der Kachel, aus der das Bild herauswächst; `null` beim Blättern. */
    origin: DOMRect | null;
    onclose: () => void;
    onstep: (delta: number) => void;
    onopen: () => void;
  } = $props();

  let figure = $state<HTMLElement>();

  /** Spalten mit Wert, dann die Facetten, die keine Spalte schon zeigt. */
  let facts = $derived([
    ...columnIds
      .filter((id) => row.cells[id]?.text)
      .map((id) => ({ label: spec.columns[id].title ?? spec.columns[id].label, text: row.cells[id].text, color: row.cells[id].color })),
    ...Object.entries(spec.facets)
      .filter(([id]) => !columnIds.includes(id))
      .map(([id, label]) => ({ label, text: facetValues(row, id).map((v) => v.label).join(', '), color: undefined }))
      .filter((f) => f.text),
  ]);

  // Nur beim Öffnen: das Bild wächst aus seiner Kachel. Danach blendet `{#key}` beim Blättern über.
  $effect(() => {
    if (!figure || !origin) return;
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
    {#key row.path}
      <button
        type="button"
        class="figure"
        class:art={image?.art}
        style="--ic:{row.iconColor}"
        title="Öffnen"
        bind:this={figure}
        onclick={onopen}
        in:fade={{ duration: origin ? 0 : 140 }}
      >
        {#if image}
          <img src={image.url} alt="" />
        {:else}
          <span class="initial">{row.name.charAt(0)}</span>
        {/if}
      </button>
    {/key}

    <aside class="info">
      <header>
        <h2>{row.name}</h2>
        {#if row.altName && row.altName !== row.name}<span class="alt">{row.altName}</span>{/if}
        {#if group}<span class="chip">{group}</span>{/if}
      </header>

      {#if facts.length}
        <dl>
          {#each facts as f}
            <dt>{f.label}</dt>
            <dd style:color={f.color}>{f.text}</dd>
          {/each}
        </dl>
      {/if}

      {#if row.blurb}
        <div class="blurb"><Markdown source={row.blurb} /></div>
      {/if}

      <footer>
        <button type="button" class="open" onclick={onopen}>Öffnen ↵</button>
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

  .figure {
    flex: none;
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
    gap: 0.9rem;
    width: 22rem;
    max-height: min(78vh, 900px);
    padding: 1.1rem 1.2rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px color-mix(in srgb, var(--ink) 18%, transparent);
  }

  header { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.35rem;
    color: var(--ink);
  }
  .alt { font-size: 0.8rem; font-style: italic; color: var(--ink-muted); }
  .chip {
    font-size: 0.72rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-soft);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.9rem;
    margin: 0;
    font-size: 0.83rem;
  }
  dt { color: var(--ink-muted); }
  dd { margin: 0; color: var(--ink); }

  .blurb {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    font-size: 0.84rem;
    color: var(--ink-soft);
    border-top: 1px solid var(--surface);
    padding-top: 0.6rem;
  }

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
