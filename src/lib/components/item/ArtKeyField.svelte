<script lang="ts">
  /** Bild eines anderen Bibliotheks-Items leihen (`artKey`) — der Weg zu einem Bild für Homebrew. */
  import type { Item } from '$lib/types';
  import { displayName, getAllItemsByDir, searchItems, type ItemInfo, type ItemSuggestion } from '$lib/itemLibrary';
  import { itemArtUrl } from '$lib/libraryArt';
  import { rarityColor } from '$lib/itemLabels';
  import { createSuggestNav } from '$lib/utils/suggestNav.svelte';
  import { dropdownPlacement } from '$lib/utils/dropdownPlacement';
  import ArtFrame from '../ui/ArtFrame.svelte';

  let { draft = $bindable() }: { draft: Item } = $props();

  let itemsByDir = $state<Record<string, ItemInfo[]>>({});
  $effect(() => {
    let live = true;
    void getAllItemsByDir().then((byDir) => { if (live) itemsByDir = byDir; });
    return () => { live = false; };
  });

  const lender = $derived(
    draft.artKey ? Object.values(itemsByDir).flat().find((i) => i.key === draft.artKey) : undefined,
  );

  let query = $state('');
  let open = $state(false);
  const suggestions = $derived(open ? searchItems(itemsByDir, query, 8) : []);

  function pick(sug: ItemSuggestion) {
    draft.artKey = sug.item.key;
    query = '';
    open = false;
    nav.reset();
  }

  const nav = createSuggestNav<ItemSuggestion>({
    items: () => suggestions,
    pick,
    escape: () => { open = false; },
  });
</script>

<div class="prop-row">
  <span class="prop-label">Bild</span>
  <div class="art-row">
    <ArtFrame src={itemArtUrl(draft)} color={rarityColor(draft.rarity)} size={44} />
    {#if draft.artKey}
      <span class="lender">von {lender ? displayName(lender) : draft.artKey}</span>
      <button type="button" class="clear" title="Wieder das eigene Bild zeigen"
        onclick={() => { draft.artKey = undefined; }}>✕</button>
    {/if}
    <div class="autocomplete-wrap">
      <input class="edit-input" value={query} placeholder="Bild von Gegenstand …"
        oninput={(e) => { query = e.currentTarget.value; open = true; nav.reset(); }}
        onkeydown={nav.onkeydown}
        onblur={() => setTimeout(() => { open = false; }, 150)} />
      {#if suggestions.length > 0}
        <ul class="suggestions" use:dropdownPlacement>
          {#each suggestions as sug, si}
            <li class:active={si === nav.index} onmousedown={() => pick(sug)}>{displayName(sug.item)}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<style>
  .art-row { display: flex; align-items: center; gap: 0.5rem; }
  .lender { font-size: 0.82rem; color: var(--ink-soft); white-space: nowrap; }
  .clear {
    background: none; border: none; color: var(--ink-muted); cursor: pointer;
    font-size: 0.8rem; padding: 0 0.2rem;
  }
  .clear:hover { color: var(--danger); }
  .autocomplete-wrap { flex: 1; min-width: 0; }
</style>
