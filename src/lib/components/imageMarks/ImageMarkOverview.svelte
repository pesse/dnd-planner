<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '../ui/Modal.svelte';
  import MarkedImage from './MarkedImage.svelte';
  import {
    STATUS_LABELS,
    clearImageMarks,
    imageMarks,
    imageMarksText,
    recheckImageMarks,
    removeImageMark,
    updateImageMark,
  } from '$lib/stores/imageMarks';
  import { IMAGE_MARK_STATUSES, type ImageMarkStatus } from '$lib/schemas/imageMark';
  import { confirmAction } from '$lib/stores/confirmDialog';
  import { pushError, pushNotice } from '$lib/stores/toasts';

  let { onclose }: { onclose: () => void } = $props();

  let checking = $state(false);
  const openCount = $derived($imageMarks.filter((m) => m.status === 'open').length);

  async function recheck() {
    checking = true;
    try {
      const fixed = await recheckImageMarks();
      if (fixed) pushNotice(`${fixed} Markierung(en) als korrigiert erkannt — das Bild hat sich geändert.`);
    } finally {
      checking = false;
    }
  }

  onMount(() => void recheck());

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(imageMarksText($imageMarks));
      pushNotice(`${$imageMarks.length} Markierung(en) in die Zwischenablage kopiert.`);
    } catch (e) {
      pushError(`Kopieren fehlgeschlagen: ${e}`);
    }
  }

  async function removeAll() {
    const ok = await confirmAction({
      title: 'Alle Markierungen entfernen',
      message: `${$imageMarks.length} Markierung(en) endgültig entfernen?`,
      confirmLabel: 'Alle entfernen',
      danger: true,
    });
    if (ok) clearImageMarks();
  }

  const percent = (v: number) => `${(v * 100).toFixed(1)} %`;
</script>

<Modal title="Bild-Fehlermarkierungen" draggable={false} width="min(760px, 94vw)" maxHeight="88vh" {onclose}>
  <div class="toolbar">
    <span class="count">{$imageMarks.length} Markierung(en), {openCount} offen</span>
    <button onclick={recheck} disabled={checking} title="Prüft, ob sich markierte Bilder geändert haben">
      {checking ? 'Prüfe…' : 'Auf Änderungen prüfen'}
    </button>
    <button onclick={copyAll} disabled={!$imageMarks.length}>Alle kopieren</button>
    <button class="danger" onclick={removeAll} disabled={!$imageMarks.length}>Alle entfernen</button>
  </div>

  {#if !$imageMarks.length}
    <p class="empty">Noch keine Markierungen. <kbd>Shift</kbd>+<kbd>M</kbd> drücken und ein Bild anklicken.</p>
  {/if}

  <ul>
    {#each $imageMarks as mark (mark.id)}
      <li class:fixed={mark.status === 'fixed'}>
        <div class="thumb">
          <MarkedImage
            url={mark.url}
            width={mark.width}
            height={mark.height}
            pins={[{ ...mark, current: true }]}
            maxHeight="8rem"
            onpick={(p) => updateImageMark(mark.id, p)}
          />
        </div>
        <div class="body">
          <div class="address" title="Adresse des Bilds">{mark.address}</div>
          <div class="meta">
            x {percent(mark.x)}, y {percent(mark.y)}
            {#if mark.width && mark.height}· Pixel {Math.round(mark.x * mark.width)}, {Math.round(mark.y * mark.height)} von {mark.width}×{mark.height}{/if}
          </div>
          <div class="meta">{mark.where}</div>
          <textarea
            rows="2"
            value={mark.text}
            placeholder="Beschreibung"
            oninput={(e) => updateImageMark(mark.id, { text: e.currentTarget.value })}
          ></textarea>
          <div class="row">
            <select
              value={mark.status}
              onchange={(e) => updateImageMark(mark.id, { status: e.currentTarget.value as ImageMarkStatus })}
            >
              {#each IMAGE_MARK_STATUSES as s (s)}<option value={s}>{STATUS_LABELS[s]}</option>{/each}
            </select>
            <button class="danger" onclick={() => removeImageMark(mark.id)}>Entfernen</button>
          </div>
        </div>
      </li>
    {/each}
  </ul>
</Modal>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .count { margin-right: auto; font-size: 0.8rem; color: var(--ink-muted); }
  button, select {
    font: inherit;
    font-size: 0.78rem;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  button.danger { color: var(--danger); }
  .empty { font-size: 0.85rem; color: var(--ink-muted); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  li {
    display: grid;
    grid-template-columns: 9rem 1fr;
    gap: 0.8rem;
    padding: 0.6rem;
    border: 1px solid var(--surface);
    border-left: 3px solid var(--danger);
    border-radius: 6px;
  }
  li.fixed { border-left-color: var(--gold); opacity: 0.75; }
  .thumb { display: flex; align-items: flex-start; justify-content: center; }
  .body { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .address {
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
    user-select: all;
  }
  .meta { font-size: 0.72rem; color: var(--ink-muted); overflow-wrap: anywhere; }
  textarea { width: 100%; box-sizing: border-box; font-family: inherit; font-size: 0.82rem; resize: vertical; }
  .row { display: flex; justify-content: space-between; gap: 0.4rem; }
</style>
