<script lang="ts" module>
  /** Hauptbereich als schmale Auswahlliste neben einer großen Bild-Detailspalte. */
  export const CHOICE_LIST_WIDTH = 'clamp(230px, 22vw, 360px)';
</script>

<script lang="ts">
  /**
   * Vollbild-Rahmen beider Assistenten: Kopf, Schrittleiste, bis zu drei Spalten
   * (Hauptbereich · Detail · Vorschau) und Fußzeile. Inhalt und Steuerung kommen per Snippet.
   */
  import { onDestroy, type Snippet } from 'svelte';
  import { interceptNavigation } from '../../services/entryPeek';
  import { navigateTo } from '../../services/navigation';
  import { confirmAction } from '../../stores/confirmDialog';
  import type { FileEntry } from '../../types';
  import EntryPeekModal from './EntryPeekModal.svelte';

  let { title, label, scope = '', mainWidth, steps = [], current = 0, onstep, onclose, children, headerExtra, detail, preview, footer }: {
    title: string;
    label: string;
    /** Klasse am Rahmen, unter der die Formularsprache des Assistenten greift. */
    scope?: string;
    /** Spaltenbreite des Hauptbereichs neben einer Detailspalte, z.B. `minmax(240px, 0.45fr)`. */
    mainWidth?: string;
    steps?: { id: string; label: string }[];
    current?: number;
    /** Nur erledigte Schritte sind anklickbar — vorwärts führt allein „Weiter". */
    onstep?: (index: number) => void;
    onclose: () => void;
    children: Snippet;
    /** Steht in der Titelzeile neben dem Titel, über alle Schritte hinweg. */
    headerExtra?: Snippet;
    detail?: Snippet;
    preview?: Snippet;
    footer: Snippet;
  } = $props();

  let previewOpen = $state(true);

  let peeked = $state<FileEntry | null>(null);
  onDestroy(interceptNavigation((entry) => (peeked = entry)));

  async function leave(entry: FileEntry) {
    const ok = await confirmAction({
      title: 'Assistent verlassen?',
      message: `„${entry.name}" öffnet sich als eigene Seite. Der Assistent wird geschlossen — alle bisherigen Wahlen gehen verloren.`,
      confirmLabel: 'Verlassen',
      danger: true,
    });
    if (!ok) return;
    peeked = null;
    onclose();
    await navigateTo(entry, { leavePeek: true });
  }
</script>

<div class="fw {scope}" role="dialog" aria-modal="true" aria-label={label}>
  <header>
    <h2>{title}</h2>
    {#if headerExtra}<div class="header-extra">{@render headerExtra()}</div>{/if}
    <button class="close" onclick={onclose} aria-label="Schließen">✕</button>
  </header>

  {#if steps.length}
    <ol class="steps">
      {#each steps as s, i (s.id)}
        <li class:active={i === current} class:done={i < current}>
          {#if i < current && onstep}
            <button type="button" onclick={() => onstep(i)}>{s.label}</button>
          {:else}
            <span>{s.label}</span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  <div class="body" class:has-detail={!!detail} class:has-preview={!!preview} class:preview-closed={!previewOpen}
       style:--fw-main={mainWidth}>
    <main class="col main">{@render children()}</main>
    {#if detail}<section class="col detail">{@render detail()}</section>{/if}
    {#if preview}
      <aside class="col preview">
        <button type="button" class="preview-toggle" onclick={() => (previewOpen = !previewOpen)}
                aria-expanded={previewOpen}>{previewOpen ? '›' : '‹'}</button>
        {#if previewOpen}{@render preview()}{/if}
      </aside>
    {/if}
  </div>

  <footer>{@render footer()}</footer>

  {#if peeked}
    {@const entry = peeked}
    <EntryPeekModal {entry} onclose={() => (peeked = null)} onleave={() => leave(entry)} />
  {/if}
</div>

<style>
  .fw {
    position: fixed; inset: 0; z-index: 1000; background: var(--bg); color: var(--ink);
    display: flex; flex-direction: column;
  }
  header {
    display: flex; align-items: center; gap: 1rem;
    padding: 0.7rem 1.4rem; border-bottom: 1px solid var(--border);
  }
  h2 { margin: 0; font-size: 1.2rem; font-family: var(--font-display, inherit); }
  .header-extra { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.5rem; }
  .close { margin-left: auto; background: none; border: none; color: var(--ink-muted); font-size: 1.3rem; line-height: 1; cursor: pointer; }

  .steps {
    list-style: none; display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0;
    padding: 0.55rem 1.4rem; font-size: 0.8rem; border-bottom: 1px solid var(--border);
  }
  .steps li > * {
    display: inline-block; padding: 0.18rem 0.6rem; border-radius: 4px;
    color: var(--ink-muted); background: none; border: none; font: inherit;
  }
  .steps li.done button { color: var(--ink-soft); cursor: pointer; text-decoration: underline dotted; }
  .steps li.done button:hover { color: var(--ink); background: var(--surface); }
  .steps li.active > * { background: var(--arcane, var(--gold)); color: #fff; font-weight: 600; }

  .body {
    flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  /* Hauptspalte bewusst nicht in fr: sonst wüchse sie mit, wenn die Vorschau einklappt. */
  .body { --fw-main-col: var(--fw-main, clamp(340px, 40vw, 640px)); --fw-pad-x: 1.4rem; }
  /* Inhaltsbreite der Detailspalte bei OFFENER Vorschau — daran hält der Inhalt seine Breite
     fest, wenn die Vorschau einklappt. */
  .body.has-detail.has-preview { --fw-detail-w: calc(100vw - var(--fw-main-col) - 300px - 2 * var(--fw-pad-x)); }
  .body.has-detail { grid-template-columns: var(--fw-main-col) minmax(0, 1fr); }
  .body.has-preview { grid-template-columns: minmax(0, 1fr) 300px; }
  .body.has-detail.has-preview { grid-template-columns: var(--fw-main-col) minmax(0, 1fr) 300px; }
  .body.has-preview.preview-closed { grid-template-columns: minmax(0, 1fr) 2.2rem; }
  .body.has-detail.has-preview.preview-closed { grid-template-columns: var(--fw-main-col) minmax(0, 1fr) 2.2rem; }
  .col { min-height: 0; overflow-y: auto; padding: 1rem var(--fw-pad-x); display: flex; flex-direction: column; gap: 0.85rem; }
  /* Sonst staucht die Flex-Spalte eine Karte mit `overflow: hidden` auf ihre Höhe, statt zu scrollen. */
  .col > :global(*) { flex-shrink: 0; }
  .detail { border-left: 1px solid var(--border); background: var(--bg-raised, var(--bg)); }
  .preview { border-left: 1px solid var(--border); position: relative; padding-top: 2.2rem; }
  .preview-closed .preview { padding: 2.2rem 0 0; }
  .preview-toggle {
    position: absolute; top: 0.4rem; left: 0.4rem; width: 1.5rem; height: 1.5rem;
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink-soft); cursor: pointer; line-height: 1;
  }

  @media (max-width: 1200px) {
    .body.has-detail, .body.has-detail.has-preview, .body.has-detail.has-preview.preview-closed {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .body.has-detail.has-preview { grid-template-rows: minmax(0, 1fr) auto; --fw-detail-w: initial; }
    .body.has-detail.has-preview .preview { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--border); max-height: 40vh; }
  }

  footer {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.75rem 1.4rem; border-top: 1px solid var(--border);
  }
</style>
