<script lang="ts">
  import type { CharacterGallery } from '../../services/characterGallery.svelte';
  import { artImageId } from '../../services/characterImages';
  import Modal from '../ui/Modal.svelte';

  let { gallery }: { gallery: CharacterGallery } = $props();

  let busy = $state(false);
  let zoomed = $state<{ url: string; label: string } | null>(null);

  async function add() {
    busy = true;
    try {
      await gallery.add();
    } finally {
      busy = false;
    }
  }
</script>

{#snippet printToggle(id: string)}
  <label class="print" title="Als Karte (70 × 99 mm) mit dem Charakterbogen drucken">
    <input type="checkbox" checked={gallery.isPrinted(id)} onchange={() => gallery.togglePrint(id)} />
    🖨 Karte
  </label>
{/snippet}

<div class="images">
  <p class="hint">Markierte Bilder bietet der Druck-Dialog als „Bildkarten" an.</p>

  <section>
    <h3>Stimmungsbilder</h3>
    {#if gallery.concept.length}
      <div class="grid">
        {#each gallery.concept as art (art.name)}
          <figure class="tile">
            <button class="frame" onclick={() => (zoomed = art)} title="Vergrößern">
              <img src={art.url} alt={art.label} />
            </button>
            <span class="label">{art.label}</span>
            {@render printToggle(artImageId(art.name))}
          </figure>
        {/each}
      </div>
    {:else}
      <p class="empty">Zu Volk, Hintergrund und Klasse gibt es (noch) kein Stimmungsbild.</p>
    {/if}
  </section>

  <section>
    <h3>
      Eigene Bilder
      <button class="btn-add" onclick={add} disabled={busy}>{busy ? '…' : '+ Bilder hinzufügen'}</button>
    </h3>
    {#if gallery.error}<p class="error">{gallery.error}</p>{/if}
    {#if gallery.own.length}
      <div class="grid">
        {#each gallery.own as img (img.file)}
          <figure class="tile">
            <button class="frame" onclick={() => (zoomed = { url: img.url, label: img.caption || img.file })} title="Vergrößern">
              {#if img.url}<img src={img.url} alt={img.caption} />{/if}
            </button>
            <input class="caption" value={img.caption} placeholder="Bildunterschrift"
              oninput={(e) => gallery.setCaption(img.file, e.currentTarget.value)} />
            <div class="row">
              {@render printToggle(img.file)}
              <button class="remove-btn" onclick={() => gallery.remove(img.file)} title="Bild aus der Galerie entfernen">✕</button>
            </div>
          </figure>
        {/each}
      </div>
    {:else}
      <p class="empty">Noch keine eigenen Bilder — Szenen, Karten, Handouts, Fan-Art …</p>
    {/if}
  </section>
</div>

{#if zoomed}
  <Modal title={zoomed.label} width="min(900px, 92vw)" maxHeight="92vh" onclose={() => (zoomed = null)}>
    <img class="zoomed" src={zoomed.url} alt={zoomed.label} />
  </Modal>
{/if}

<style>
  .images {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .hint, .empty { color: var(--ink-muted); font-size: 0.8rem; margin: 0; }
  .error { color: var(--danger); font-size: 0.8rem; }

  h3 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0 0 0.6rem;
  }

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

  .caption {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-raised);
    color: var(--ink);
  }

  .row { display: flex; align-items: center; justify-content: space-between; }

  .print {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: var(--ink-muted);
    cursor: pointer;
  }

  .btn-add {
    font: inherit;
    font-size: 0.78rem;
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--green);
    cursor: pointer;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .remove-btn:hover { color: var(--danger); }

  .zoomed { max-width: 100%; max-height: 80vh; display: block; margin: 0 auto; }
</style>
