<script lang="ts">
  /**
   * Dialog-Rahmen: Kopfzeile, Schließen-Knopf und Rahmen-Geometrie.
   * `draggable` entscheidet über die Verankerung — gezogen (frei platziert, kein
   * Backdrop) oder zentriert hinter einem Backdrop.
   */
  import { untrack, type Snippet } from 'svelte';
  import { createDragDialog } from '../../utils/dragDialog.svelte';

  let {
    title,
    label = title,
    draggable = true,
    top = 80,
    width = 'min(560px, 92vw)',
    maxHeight = '84vh',
    pad = '1.1rem',
    padBottom = '1.2rem',
    onclose,
    children,
  }: {
    /** Sichtbarer Titel in der Kopfzeile. */
    title: string;
    /** `aria-label` des Dialogs, falls der sichtbare Titel Zusätze trägt. */
    label?: string;
    draggable?: boolean;
    /** Anfangs-Abstand von oben, nur bei `draggable`. */
    top?: number;
    width?: string;
    maxHeight?: string;
    pad?: string;
    padBottom?: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  // Verankerung wird einmal beim Mount entschieden; `untrack` hält sie aus dem Graph.
  const drag = untrack(() => (draggable ? createDragDialog(top) : null));

  const style = $derived(
    `--modal-w: ${width}; --modal-max-h: ${maxHeight}; --modal-pad: ${pad}; --modal-pad-b: ${padBottom};` +
      (drag ? ` left: ${drag.pos.x}px; top: ${drag.pos.y}px;` : ''),
  );
</script>

{#if !draggable}
  <div class="backdrop" role="presentation" onclick={onclose}></div>
{/if}

<div class="dialog" class:centered={!draggable} {style} role="dialog" aria-label={label}>
  <div class="modal-header" class:grab={!!drag} onmousedown={drag?.startDrag} role="presentation">
    <span class="modal-title">{title}</span>
    <button class="close-btn" onmousedown={(e) => e.stopPropagation()} onclick={onclose} title="Schließen">×</button>
  </div>
  {@render children()}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 999;
  }

  .dialog {
    position: fixed;
    width: var(--modal-w);
    max-height: var(--modal-max-h);
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0 var(--modal-pad) var(--modal-pad-b);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }
  .dialog.centered {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    margin: 0 calc(-1 * var(--modal-pad)) 0.2rem;
    padding: 0.6rem var(--modal-pad);
    border-bottom: 1px solid var(--surface);
    position: sticky;
    top: 0;
    background: var(--bg);
  }
  .modal-header.grab { cursor: grab; }
  .modal-header.grab:active { cursor: grabbing; }

  .modal-title { font-weight: 700; font-size: 1rem; color: var(--ink); }
  .close-btn { background: none; border: none; color: var(--ink-muted); font-size: 1.3rem; cursor: pointer; line-height: 1; }
  .close-btn:hover { color: var(--ink); }
</style>
