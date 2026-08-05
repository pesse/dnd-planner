<script lang="ts">
  import type { Item } from '$lib/types';
  import { normalizeItem } from '$lib/utils/schemaValidation';
  import { prepareItemPrint } from '$lib/utils/printItem';
  import { printHtmlDocument } from '$lib/utils/printFrame';
  import EditorPanel from './EditorPanel.svelte';
  import AiEditModal from './AiEditModal.svelte';
  import { editItemAction } from '$lib/services/aiActions/itemAction';
  import TranslateModal from './TranslateModal.svelte';
  import ItemCardView from './item/ItemCardView.svelte';
  import ItemEditForm from './item/ItemEditForm.svelte';
  import { createItemCardEditor } from './item/itemCardEditor.svelte';

  const ic = createItemCardEditor();
  const ed = ic.ed;

  let showAiModal = $state(false);
  let showTranslateModal = $state(false);

  function printItem() {
    if (!ic.item) return;
    printHtmlDocument(prepareItemPrint(ic.item, document), ic.item.name_de ?? ic.item.name);
  }
</script>

<EditorPanel
  bind:tab={ed.tab}
  dirty={ed.dirty}
  saveError={ed.saveError}
  onsave={async () => { await ed.save(); if (!ed.dirty) ed.tab = 'karte'; }}
  ondiscard={() => { ed.discard(); ed.tab = 'karte'; }}
  onsavejson={async (json) => {
    if (ed.isNew) { ed.draft = normalizeItem(JSON.parse(json)); ic.syncMirrors(ed.draft); await ed.saveAs(); return; }
    await ed.saveJson(json);
    ic.syncMirrors(ed.draft);
  }}
  getJson={() => ed.draft ? ic.merged(ed.draft, 2) : ed.lastSavedContent}
  style="--ep-accent: {ic.color}"
>

{#snippet tabactions()}
  <button class="pdf-tab-btn" onclick={printItem} disabled={!ic.item}>PDF</button>
{/snippet}

{#snippet karte()}
  <ItemCardView item={ic.item} color={ic.color} parseError={ic.saved.parseError} />
{/snippet}

{#snippet bearbeiten()}
  <ItemEditForm
    bind:draft={ed.draft}
    isNew={ed.isNew}
    bind:draftDescText={ic.draftDescText}
    bind:draftDescDeText={ic.draftDescDeText}
    bind:draftPropsText={ic.draftPropsText}
    bind:draftRarityName={ic.draftRarityName}
    onimport={(imported) => ic.applyImport(imported)}
    onOpenAi={() => (showAiModal = true)}
    onOpenTranslate={() => (showTranslateModal = true)}
  />
{/snippet}

</EditorPanel>

{#if showAiModal && ed.draft}
  <AiEditModal
    entityName={ed.draft.name_de || ed.draft.name || 'Gegenstand'}
    buildAction={() => editItemAction($state.snapshot(ed.draft) as Item)}
    onresult={(result) => ic.applyAiResult(result)}
    onclose={() => (showAiModal = false)}
  />
{/if}

{#if showTranslateModal && ed.draft}
  <TranslateModal
    entityName={ed.draft.name_de || ed.draft.name || 'Gegenstand'}
    build={() => ic.buildTranslationRun()}
    onresult={(t) => ic.applyTranslation(t)}
    onclose={() => (showTranslateModal = false)}
  />
{/if}

<style>
  .pdf-tab-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.15rem 0.55rem;
    border-radius: 4px;
    font-family: inherit;
  }
  .pdf-tab-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-muted); }
  .pdf-tab-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
