<script lang="ts">
  /** Gegenstand aus Open5e v2 (Ausrüstung + Magie) laden. */
  import type { Item } from '$lib/types';
  import DndApiSearch from '../DndApiSearch.svelte';
  import { getOpen5eItem, searchOpen5eItems, type Open5eItemSearchResult } from '$lib/services/open5eClient';
  import { mapOpen5eItem } from '$lib/services/open5eItemMapper';

  let { onimport }: { onimport: (item: Item) => void } = $props();

  let apiRawResponse = $state<string | null>(null);
  let showApiRaw = $state(false);
  let importError = $state('');

  async function select(result: Open5eItemSearchResult) {
    try {
      const data = await getOpen5eItem(result.url);
      apiRawResponse = JSON.stringify(data, null, 2);
      showApiRaw = false;
      onimport(mapOpen5eItem(data));
      importError = '';
    } catch (e) {
      importError = `Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
</script>

<div class="edit-section api-section">
  <DndApiSearch
    label="Aus Open5e laden"
    placeholder="Name suchen (englisch)…"
    onsearch={searchOpen5eItems}
    onselect={select}
  />
  {#if importError}<span class="translate-error">{importError}</span>{/if}
  {#if apiRawResponse}
    <button class="api-raw-toggle" onclick={() => { showApiRaw = !showApiRaw; }}>
      API-Antwort {showApiRaw ? '▲' : '▼'}
    </button>
    {#if showApiRaw}
      <pre class="api-raw-pre">{apiRawResponse}</pre>
    {/if}
  {/if}
</div>

<style>
  .api-section {
    background: color-mix(in srgb, var(--cat-color) 5%, var(--bg-panel));
    border-top: 1px solid var(--surface);
  }

  .api-raw-toggle {
    background: none; border: none; color: var(--border); font-size: 0.72rem;
    cursor: pointer; padding: 0.2rem 0; font-family: inherit; text-align: left;
  }
  .api-raw-toggle:hover { color: var(--ink-muted); }

  .api-raw-pre {
    background: var(--bg-deep); border: 1px solid var(--surface); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.72rem; line-height: 1.5;
    padding: 0.6rem 0.8rem; overflow-x: auto; white-space: pre;
    margin: 0; max-height: 300px; overflow-y: auto;
  }
</style>
