<script lang="ts" generics="T extends { url: string; label: string }">
  import type { Snippet } from 'svelte';
  import Modal from './Modal.svelte';

  let { images, id, below }: {
    images: T[];
    id: (image: T) => string;
    /** Ersetzt die Bildunterschrift unter der Kachel. */
    below?: Snippet<[T]>;
  } = $props();

  let zoomed = $state<T | null>(null);
</script>

<div class="grid">
  {#each images as image (id(image))}
    <figure class="tile">
      <button class="frame" onclick={() => (zoomed = image)} title="Vergrößern">
        {#if image.url}<img src={image.url} alt={image.label} />{/if}
      </button>
      {#if below}{@render below(image)}{:else}<span class="label">{image.label}</span>{/if}
    </figure>
  {/each}
</div>

{#if zoomed}
  <Modal title={zoomed.label} width="min(900px, 92vw)" maxHeight="92vh" onclose={() => (zoomed = null)}>
    <img class="zoomed" src={zoomed.url} alt={zoomed.label} />
  </Modal>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.9rem;
  }

  .tile {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .frame {
    aspect-ratio: 70 / 99;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-deep);
    overflow: hidden;
    cursor: zoom-in;
  }
  .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .label { font-size: 0.8rem; color: var(--ink-soft); }

  .zoomed { max-width: 100%; max-height: 80vh; display: block; margin: 0 auto; }
</style>
