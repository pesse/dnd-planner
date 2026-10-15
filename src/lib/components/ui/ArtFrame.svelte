<script lang="ts">
  /** Bibliotheksbild im Rahmen; fehlt das Bild, verschwindet der ganze Rahmen. Klick vergrößert. */
  import ArtLightbox from './ArtLightbox.svelte';

  let { src, color, size = 60 }: { src: string | null; color: string; size?: number } = $props();

  let failed = $state(false);
  let open = $state(false);
  $effect(() => {
    void src;
    failed = false;
  });
</script>

{#if src && !failed}
  <button type="button" class="art-frame" style="--af-c:{color};--af-size:{size}px" title="Vergrößern" onclick={() => (open = true)}>
    <img {src} alt="" onerror={() => (failed = true)} />
  </button>
  {#if open}<ArtLightbox {src} {color} onclose={() => (open = false)} />{/if}
{/if}

<style>
  .art-frame {
    width: var(--af-size);
    height: var(--af-size);
    flex-shrink: 0;
    cursor: zoom-in;
    font: inherit;
    padding: 4px;
    box-sizing: border-box;
    border-radius: 10px;
    border: 1px solid var(--gold);
    background:
      radial-gradient(circle at 50% 42%,
        color-mix(in srgb, var(--af-c) 35%, white) 0%,
        color-mix(in srgb, var(--af-c) 75%, white) 55%,
        var(--af-c) 100%);
    box-shadow:
      inset 0 0 0 2px var(--bg-panel),
      inset 0 0 0 3px color-mix(in srgb, var(--gold) 70%, transparent),
      inset 0 0 10px rgba(0, 0, 0, 0.25),
      0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .art-frame img {
    display: block;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }
</style>
