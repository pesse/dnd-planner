<script lang="ts">
  /**
   * Wahl der Bogen-Abschnitte plus Vorschau. Gedruckt wird derselbe String, der links
   * im Iframe steht — der Katalog liegt in `print/character/sections.ts`.
   */
  import { printHtmlDocument } from '../../utils/printFrame';
  import { loadCharacterPrintData, type CharacterPrintData, type PrintDataInput } from '../../print/character/data';
  import { buildCharacterSheetHtml } from '../../print/character/document';
  import { SHEET_PAGES, defaultSelection, sheetSections } from '../../print/character/sections';
  import { loadSpellCardPages } from '../../print/character/spellCards';
  import { loadSpellcasting } from '../../services/spellcasting/project';
  import Modal from '../ui/Modal.svelte';
  import PrintPreview from '../print/PrintPreview.svelte';

  let { input, onclose }: { input: PrintDataInput; onclose: () => void } = $props();

  let data = $state<CharacterPrintData | null>(null);
  let error = $state('');
  let selection = $state<Record<string, boolean>>({});
  let zoom = $state(0.6);

  let cardsBusy = $state(false);

  void (async () => {
    try {
      const loaded = await loadCharacterPrintData(input);
      selection = defaultSelection(sheetSections(loaded));
      data = loaded;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  })();

  /**
   * Die Volltext-Karten messen ihre Textmenge im DOM aus — das hält den Bogen auf und blendet
   * kurz fremde Stile ein, also passiert es erst, wenn sie wirklich gewählt sind.
   */
  async function loadCards() {
    if (!data || data.spellCards || cardsBusy) return;
    cardsBusy = true;
    try {
      const loaded = input.loaded ?? (await loadSpellcasting(input.character));
      data = { ...data, spellCards: await loadSpellCardPages(data.grouped, loaded.lookup, document) };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cardsBusy = false;
    }
  }

  $effect(() => {
    if (selection.spellCards) void loadCards();
  });

  const sections = $derived(data ? sheetSections(data) : []);
  const html = $derived(data ? buildCharacterSheetHtml(data, selection) : '');

  const groups = $derived(
    SHEET_PAGES.map((p) => ({ ...p, items: sections.filter((s) => s.page === p.id) }))
      .filter((g) => g.items.length > 0),
  );

  const setGroup = (ids: string[], on: boolean) => {
    for (const id of ids) selection[id] = on;
  };
</script>

<Modal
  title="🖨 Charakterbogen drucken — {input.character.name}"
  label="Charakterbogen drucken"
  draggable={false}
  width="min(1180px, 96vw)"
  maxHeight="92vh"
  {onclose}
>
  <div class="print-body">
    <aside class="picker">
      {#if error}
        <p class="error">{error}</p>
      {:else if !data}
        <p class="hint">Lade Bogen…</p>
      {:else}
        {#each groups as group}
          <div class="group">
            <div class="group-head">
              <span class="group-title">{group.label}</span>
              <button class="link" onclick={() => setGroup(group.items.map((s) => s.id), !group.items.every((s) => selection[s.id]))}>
                {group.items.every((s) => selection[s.id]) ? 'keine' : 'alle'}
              </button>
            </div>
            {#each group.items as section}
              <label class="opt">
                <input type="checkbox" bind:checked={selection[section.id]} />
                <span>{section.label}</span>
                {#if section.id === 'spellCards' && cardsBusy}<span class="busy">lädt…</span>{/if}
              </label>
            {/each}
          </div>
        {/each}
      {/if}
    </aside>

    <PrintPreview {html} {zoom} />
  </div>

  <div class="print-bar">
    <label class="zoom">
      Zoom
      <input type="range" min="0.3" max="1.2" step="0.05" bind:value={zoom} />
      <span class="zoom-val">{Math.round(zoom * 100)}%</span>
    </label>
    <button class="primary" disabled={!data || cardsBusy} onclick={() => printHtmlDocument(html, `${input.character.name} – Charakterbogen`)}>
      Drucken / Als PDF speichern
    </button>
  </div>
</Modal>

<style>
  .print-body {
    display: flex;
    gap: 0.9rem;
    min-height: 0;
    flex: 1;
  }

  .picker {
    width: 15rem;
    flex: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
    margin-bottom: 0.3rem;
  }

  .group-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-muted);
  }

  .link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.75rem;
    color: var(--arcane);
    cursor: pointer;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.12rem 0;
    cursor: pointer;
  }

  .hint { color: var(--ink-muted); }
  .busy { color: var(--ink-muted); font-size: 0.78rem; font-style: italic; }
  .error { color: var(--danger); }

  .print-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    border-top: 1px solid var(--surface);
    padding-top: 0.7rem;
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .zoom-val { min-width: 2.8rem; }

  .primary {
    margin-left: auto;
    background: var(--arcane);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.45rem 0.9rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary:disabled { opacity: 0.5; cursor: default; }
</style>
