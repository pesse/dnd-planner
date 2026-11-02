<script lang="ts">
  /** Vorschau eines Bibliothekseintrags oder Charakters, statt dorthin zu wechseln. */
  import { fade, scale } from 'svelte/transition';
  import type { FileEntry } from '../../types';
  import EntryCard from './EntryCard.svelte';

  let { entry, onclose, onleave }: {
    entry: FileEntry;
    onclose: () => void;
    /** Die Seite wirklich öffnen — der Aufrufer führt die Rückfrage. */
    onleave: () => void;
  } = $props();

  // Capture-Phase: sonst erreicht Escape zuerst Handler darunter, etwa die den Assistenten schließen.
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    onclose();
  }
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div class="backdrop" role="presentation" onclick={onclose} transition:fade={{ duration: 150 }}></div>
<div class="peek" role="dialog" aria-label={entry.name} transition:scale={{ start: 0.96, duration: 180 }}>
  <div class="scroll">
    <EntryCard {entry} />
  </div>
  <div class="actions">
    <button type="button" class="secondary-btn" onclick={onleave}>Seite öffnen …</button>
    <button type="button" class="primary-btn" onclick={onclose}>Schließen</button>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1001; background: rgba(20, 12, 2, 0.5); backdrop-filter: blur(2px); }
  .peek {
    position: fixed; z-index: 1002; left: 50%; top: 50%; translate: -50% -50%;
    width: min(560px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: 0.6rem;
  }
  .scroll {
    position: relative; overflow-y: auto; min-height: 0; border-radius: 8px; background: var(--bg);
    box-shadow: 0 14px 44px rgba(0, 0, 0, 0.5);
  }
  .scroll > :global(*) { max-width: none; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
