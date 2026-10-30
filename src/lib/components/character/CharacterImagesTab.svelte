<script lang="ts">
  import type { CharacterGallery } from '../../services/characterGallery.svelte';
  import { artImageId } from '../../services/characterImages';
  import ArtGallery from '../ui/ArtGallery.svelte';

  let { gallery }: { gallery: CharacterGallery } = $props();

  let busy = $state(false);
  let own = $derived(gallery.own.map((img) => ({ ...img, label: img.caption || img.file })));

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
      <ArtGallery images={gallery.concept} id={(art) => art.name}>
        {#snippet below(art)}
          <span class="label">{art.label}</span>
          {@render printToggle(artImageId(art.name))}
        {/snippet}
      </ArtGallery>
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
    {#if own.length}
      <ArtGallery images={own} id={(img) => img.file}>
        {#snippet below(img)}
          <input class="caption" value={img.caption} placeholder="Bildunterschrift"
            oninput={(e) => gallery.setCaption(img.file, e.currentTarget.value)} />
          <div class="row">
            {@render printToggle(img.file)}
            <button class="remove-btn" onclick={() => gallery.remove(img.file)} title="Bild aus der Galerie entfernen">✕</button>
          </div>
        {/snippet}
      </ArtGallery>
    {:else}
      <p class="empty">Noch keine eigenen Bilder — Szenen, Karten, Handouts, Fan-Art …</p>
    {/if}
  </section>
</div>

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
</style>
