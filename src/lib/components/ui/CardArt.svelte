<script lang="ts">
  /** Bibliotheksbild frei im Kartenkopf; fehlt es, bleibt der Platz leer. Klick vergrößert. */
  import ArtLightbox from './ArtLightbox.svelte';

  let { src, color, size = 112 }: { src: string | null; color: string; size?: number } = $props();

  let failed = $state<string | null>(null);
  let open = $state(false);
</script>

{#if src && failed !== src}
  <button type="button" class="card-art" style="--ca-c:{color};--ca-size:{size}px" title="Vergrößern" onclick={() => (open = true)}>
    <img {src} alt="" onerror={() => (failed = src)} />
  </button>
  {#if open}<ArtLightbox {src} {color} onclose={() => (open = false)} />{/if}
{/if}

<style>
  .card-art {
    display: block;
    width: var(--ca-size);
    height: var(--ca-size);
    margin: -0.2rem auto 0.35rem;
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
    filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--ca-c) 45%, transparent));
  }
  .card-art img { display: block; width: 100%; height: 100%; }
</style>
