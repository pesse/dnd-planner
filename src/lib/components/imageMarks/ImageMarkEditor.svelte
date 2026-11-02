<script lang="ts">
  import Modal from '../ui/Modal.svelte';
  import MarkedImage from './MarkedImage.svelte';
  import { addImageMark, imageMarks, type ImageMarkDraft } from '$lib/stores/imageMarks';

  let { draft, onclose }: { draft: ImageMarkDraft; onclose: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let point = $state({ x: draft.x, y: draft.y });
  let text = $state('');
  const earlier = $derived($imageMarks.filter((m) => m.address === draft.address && m.status === 'open'));

  function save() {
    addImageMark({ ...draft, ...point, text: text.trim() });
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
  }
</script>

<!-- Über der Bild-Lightbox (ArtLightbox), aus der heraus oft markiert wird. -->
<Modal title="Fehler im Bild markieren" draggable={false} layer={20000} width="min(520px, 92vw)" {onclose}>
  <MarkedImage url={draft.url} width={draft.width} height={draft.height} pins={[...earlier, { ...point, current: true }]} maxHeight="18rem" onpick={(p) => (point = p)} />
  <dl class="facts">
    <dt>Bild</dt><dd class="mono">{draft.address}</dd>
    <dt>Ort</dt><dd>{draft.where}</dd>
    {#if earlier.length}<dt>Bisher</dt><dd>{earlier.length} offene Markierung(en) auf diesem Bild</dd>{/if}
  </dl>
  <!-- svelte-ignore a11y_autofocus -->
  <textarea bind:value={text} {onkeydown} rows="3" placeholder="Was stimmt an dieser Stelle nicht?" autofocus></textarea>
  <div class="actions">
    <button class="cancel-btn" onclick={onclose}>Abbrechen</button>
    <button class="ok-btn" onclick={save}>Markierung speichern</button>
  </div>
</Modal>

<style>
  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.7rem;
    margin: 0;
    font-size: 0.8rem;
  }
  dt { color: var(--ink-muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .mono { font-family: var(--font-mono, monospace); font-size: 0.75rem; user-select: all; }
  textarea { width: 100%; box-sizing: border-box; font-family: inherit; resize: vertical; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .actions button { border-radius: 4px; padding: 0.35rem 0.9rem; cursor: pointer; font: inherit; font-size: 0.82rem; }
</style>
