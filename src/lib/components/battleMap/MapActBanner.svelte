<script lang="ts">
  /** Eine Karte gehört zu mindestens einem Akt; ältere Karten haben noch keinen. */
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { actSummaries } from '../../stores/context';

  let { editor }: { editor: MapEditor } = $props();

  function choose(act: string) {
    if (!act || !editor.map) return;
    editor.checkpoint();
    editor.map.acts = [act];
    editor.changed();
  }
</script>

<div class="banner" role="status">
  {#if $actSummaries.length}
    <span>Diese Karte gehört noch zu keinem Akt — bis dahin stehen nur die Encounter der Kampagne zur Auswahl.</span>
    <select aria-label="Akt der Karte" onchange={(e) => choose(e.currentTarget.value)}>
      <option value="">Akt wählen…</option>
      {#each $actSummaries as a (a.name)}<option value={a.name}>{a.title || a.name}</option>{/each}
    </select>
  {:else}
    <span>Diese Karte gehört noch zu keinem Akt. Lege in der Kampagne einen Akt an, um ihn hier zuzuordnen.</span>
  {/if}
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.4rem 1rem;
    background: color-mix(in srgb, var(--gold) 22%, var(--bg-panel));
    border-bottom: 1px solid var(--border);
    color: var(--ink);
    font-size: 0.85rem;
    position: relative;
    z-index: 2;
  }
  select {
    padding: 0.2rem 0.4rem;
  }
</style>
