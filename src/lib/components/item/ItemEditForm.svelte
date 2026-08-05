<script lang="ts">
  import type { Item } from '$lib/types';
  import { dirOf, structuralType, isMagicItem } from '$lib/itemLibrary';
  import { CATEGORY_LABELS, rarityColor } from '$lib/itemLabels';
  import { SOURCE_KEYS, SOURCE_LABELS } from '$lib/schemas/source';
  import { activeFile } from '$lib/stores/campaign';
  import MagicFacetFields from './MagicFacetFields.svelte';
  import WeaponFields from './WeaponFields.svelte';
  import ArmorFields from './ArmorFields.svelte';
  import CostWeightFields from './CostWeightFields.svelte';
  import Open5eImportPanel from './Open5eImportPanel.svelte';

  let {
    draft = $bindable(),
    isNew,
    draftDescText = $bindable(),
    draftDescDeText = $bindable(),
    draftPropsText = $bindable(),
    draftRarityName = $bindable(),
    onimport,
    onOpenAi,
    onOpenTranslate,
  }: {
    draft: Item | null;
    isNew: boolean;
    draftDescText: string;
    draftDescDeText: string;
    draftPropsText: string;
    draftRarityName: string;
    onimport: (item: Item) => void;
    onOpenAi: () => void;
    onOpenTranslate: () => void;
  } = $props();

  const categoryKeyOf = dirOf;

  /** Der Anzeigename muss DnD-API-konform sein: "wondrous-items" → "Wondrous Items". */
  function categoryApiName(catKey: string): string {
    return catKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function setDraftCategory(catKey: string) {
    if (!draft) return;
    draft.equipment_category = { index: catKey, name: categoryApiName(catKey) };
  }
</script>

{#if draft}
  <div class="item-card edit-mode" style="--cat-color: {rarityColor(draftRarityName)}">
    {#if isNew}
      <div class="new-banner">Neuer Gegenstand — noch nicht gespeichert.</div>
    {/if}
    <div class="card-header">
      <div class="edit-header-top">
        <input class="edit-name" bind:value={draft.name_de} placeholder="Name (Deutsch)" />
      </div>
      <input class="edit-name-original" bind:value={draft.name} placeholder="Original (Englisch)" />
      <div class="edit-header-meta">
        <select class="edit-select"
          value={categoryKeyOf(draft)}
          onchange={(e) => setDraftCategory((e.target as HTMLSelectElement).value)}>
          {#each Object.entries(CATEGORY_LABELS) as [key, label]}
            <option value={key}>{label}</option>
          {/each}
        </select>
        <select class="edit-select" bind:value={draft.source}>
          {#each SOURCE_KEYS as key}
            <option value={key}>{SOURCE_LABELS[key]}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="card-props">
      <!-- Additiv, unabhängig vom Strukturtyp: auch eine magische Waffe zeigt das. -->
      {#if isMagicItem(draft)}
        <MagicFacetFields bind:draft={draft} bind:rarityName={draftRarityName} />
      {/if}

      {#if structuralType(draft) === 'weapon'}
        <WeaponFields bind:draft={draft} bind:propsText={draftPropsText} />
      {:else if structuralType(draft) === 'armor'}
        <ArmorFields bind:draft={draft} />
      {/if}

      <CostWeightFields bind:draft={draft} />
    </div>

    <div class="card-divider"></div>

    <div class="edit-section">
      <span class="edit-section-label">Beschreibung (Deutsch)</span>
      <textarea class="edit-textarea" bind:value={draftDescDeText} rows={6}
        placeholder="Deutsche Beschreibung…"></textarea>
    </div>

    <div class="card-divider"></div>

    <details class="edit-section edit-section-collapsible">
      <summary class="edit-section-label">Beschreibung (Original / Englisch)</summary>
      <textarea class="edit-textarea edit-textarea-secondary" bind:value={draftDescText} rows={5}
        style="margin-top: 0.4rem;"></textarea>
    </details>

    <div class="card-divider"></div>

    <div class="edit-section ai-section">
      <span class="ai-label">KI-Werkzeuge</span>
      <div class="ai-tools-row">
        <button class="ai-btn" onclick={onOpenTranslate}>🌐 Übersetzen…</button>
        <button class="ai-btn" onclick={onOpenAi}>✨ KI überarbeiten…</button>
      </div>
    </div>

    <div class="card-divider"></div>

    {#key $activeFile?.path}
      <Open5eImportPanel {onimport} />
    {/key}
  </div>

{:else}
  <div class="error">Kein Gegenstand geladen.</div>
{/if}

<style>
  .item-card {
    width: 100%;
    max-width: 580px;
    background: var(--bg-panel);
    border-radius: 10px;
    border: 1px solid var(--surface);
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.33);
    height: fit-content;
  }

  .card-header {
    background: color-mix(in srgb, var(--cat-color) 18%, var(--bg-panel));
    border-bottom: 3px solid var(--cat-color);
    padding: 1.2rem 1.4rem 1rem;
  }

  .card-props { padding: 0.9rem 1.4rem; display: flex; flex-direction: column; gap: 0.45rem; }

  /* `:global`, weil die Unterformulare Teile DIESER Karte sind und keine eigenständigen
     Bausteine — eine Kopie je Unterformular wäre dieselbe Regel fünfmal. */
  .item-card :global(.prop-row) {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 0.5rem;
    font-size: 0.88rem;
    line-height: 1.4;
    align-items: center;
  }

  .item-card :global(.prop-label) {
    color: var(--ink-muted);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .item-card :global(.edit-select) {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.82rem; padding: 0.2rem 0.4rem;
    outline: none; font-family: inherit;
  }
  .item-card :global(.edit-select:focus) { border-color: var(--cat-color); }

  .item-card :global(.edit-input) {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.2rem 0.5rem;
    outline: none; font-family: inherit; width: 100%;
  }
  .item-card :global(.edit-input:focus) { border-color: var(--cat-color); }

  .item-card :global(.edit-check) {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.85rem; color: var(--ink-soft); cursor: pointer;
  }

  .item-card :global(.edit-section) {
    padding: 0.7rem 1.4rem; display: flex; flex-direction: column; gap: 0.4rem;
  }

  .card-divider { height: 1px; background: var(--surface); margin: 0 1.4rem; }

  .edit-header-top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.5rem; margin-bottom: 0.6rem;
  }

  .edit-name {
    font-size: 1.3rem; font-weight: 700;
    background: var(--surface); border: 1px solid var(--border); border-radius: 5px;
    color: var(--ink); padding: 0.3rem 0.6rem; flex: 1; min-width: 0;
    font-family: inherit; outline: none;
  }
  .edit-name:focus { border-color: var(--cat-color); }

  .edit-name-original {
    font-size: 0.85rem;
    background: transparent; border: none; border-bottom: 1px solid var(--surface);
    color: var(--ink-muted); padding: 0.2rem 0.6rem; width: 100%;
    font-family: inherit; outline: none; font-style: italic;
    margin-bottom: 0.4rem;
  }
  .edit-name-original:focus { border-bottom-color: var(--border); color: var(--ink-soft); }

  .edit-header-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }

  .edit-section-collapsible { cursor: default; }
  .edit-section-collapsible summary { cursor: pointer; user-select: none; list-style: none; }
  .edit-section-collapsible summary::before { content: '› '; color: var(--border); }
  .edit-section-collapsible[open] summary::before { content: '▾ '; }

  .edit-section-label {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--ink-muted);
  }

  .edit-textarea {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.4rem 0.6rem;
    resize: vertical; outline: none; font-family: inherit; line-height: 1.6; width: 100%;
  }
  .edit-textarea:focus { border-color: var(--cat-color); }
  .edit-textarea-secondary { color: var(--ink-muted); font-style: italic; }

  .new-banner {
    font-size: 0.78rem; color: var(--gold, #c89b3c);
    background: color-mix(in srgb, var(--gold, #c89b3c) 12%, var(--bg-panel));
    border-radius: 4px; padding: 0.3rem 0.5rem; margin-bottom: 0.5rem;
  }

  .ai-section {
    background: color-mix(in srgb, var(--arcane) 6%, var(--bg-panel));
    border-top: 1px solid var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ai-tools-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ai-label {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--ink-muted);
  }
  .ai-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink-soft); font-size: 0.82rem; padding: 0.2rem 0.7rem; cursor: pointer;
    font-family: inherit; white-space: nowrap;
  }
  .ai-btn:hover:not(:disabled) { color: var(--arcane); border-color: var(--arcane); }
  .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .error { color: var(--danger); padding: 2rem; font-size: 0.9rem; }
</style>
