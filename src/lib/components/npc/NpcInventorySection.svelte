<script lang="ts">
  /**
   * Inventar eines NPC: gespeichert werden Namen, der Bibliotheks-Treffer wird zur
   * Laufzeit aufgelöst — er liefert Farbpunkt, Hover-Karte, Sprung und die Kurzinfo.
   */
  import { invoke } from '@tauri-apps/api/core';
  import {
    getItemsByDir, searchItems, displayName, buildItemIndex, matchItem, structuralType,
    type ItemInfo, type ItemSuggestion,
  } from '../../itemLibrary';
  import { CATEGORY_COLORS, DIR_TO_CATEGORY } from '../../itemLabels';
  import { formatRarity, weaponDamageLine } from '../../itemFormat';
  import { openItemPage } from '../../services/vaultLinks';
  import { createSuggestNav } from '../../utils/suggestNav.svelte';
  import { createHoverTip } from '../../utils/hoverTip.svelte';
  import ItemTooltip from '../ItemTooltip.svelte';
  import type { Npc } from '../../schemas/npc';
  import type { Item } from '../../types';
  import './npcCard.css';

  let { npc }: { npc: Npc } = $props();

  let newItem = $state('');
  let suggestions = $state<ItemSuggestion[]>([]);
  let itemLoadedByDir = $state<Record<string, ItemInfo[]>>({});

  $effect(() => {
    Promise.all(
      Object.keys(DIR_TO_CATEGORY).map(dir =>
        getItemsByDir(dir).then(items => ({ dir, items }))
      )
    ).then(results => {
      const map: Record<string, ItemInfo[]> = {};
      for (const { dir, items } of results) map[dir] = items;
      itemLoadedByDir = map;
    });
  });

  const itemIndex = $derived(buildItemIndex(itemLoadedByDir));

  let itemDataRecord = $state<Record<string, Item | null>>({});
  const tip = createHoverTip<Item>();

  $effect(() => {
    for (const name of npc.inventory) {
      const libItem = matchItem(itemIndex, { name });
      if (libItem && !(libItem.path in itemDataRecord)) {
        itemDataRecord[libItem.path] = null;
        invoke<string>('read_file_content', { path: libItem.path })
          .then(content => { itemDataRecord[libItem.path] = JSON.parse(content) as Item; })
          .catch(() => {});
      }
    }
  });

  function onInput() {
    suggestions = searchItems(itemLoadedByDir, newItem, 8);
    nav.reset();
  }

  function select(sug: ItemSuggestion) {
    newItem = sug.item.name; // englischer Originalname → JSON
    suggestions = [];
    nav.reset();
  }

  function addItem() {
    if (!newItem.trim()) return;
    npc.inventory = [...npc.inventory, newItem.trim()];
    newItem = '';
  }
  function removeItem(i: number) {
    npc.inventory = npc.inventory.filter((_, idx) => idx !== i);
  }

  const nav = createSuggestNav<ItemSuggestion>({
    items: () => suggestions,
    pick: select,
    enter: addItem,
    escape: () => { suggestions = []; },
  });
</script>

<div class="section">
  <h3>Inventar</h3>
  <div class="item-list">
    {#each npc.inventory as item, i}
      {@const libItem = matchItem(itemIndex, { name: item })}
      {@const fullItem = libItem ? itemDataRecord[libItem.path] : null}
      <div class="item-row"
        onmouseenter={(e) => tip.show(e, fullItem)}
        onmousemove={tip.move}
        onmouseleave={tip.hide}
      >
        {#if libItem}
          <span class="item-dot" style="background:{CATEGORY_COLORS[libItem.category] ?? 'var(--border-strong)'}"></span>
        {/if}
        <span
          class="item-name"
          class:item-linked={!!libItem}
          onclick={() => libItem && openItemPage(libItem)}
        >{libItem ? displayName(libItem) : item}</span>
        {#if fullItem && structuralType(fullItem) === 'weapon' && fullItem.damage}
          <span class="item-inline-info">{weaponDamageLine(fullItem)}</span>
        {:else if fullItem && structuralType(fullItem) === 'armor' && fullItem.armor_class}
          <span class="item-inline-info">RK {fullItem.armor_class.base}{fullItem.armor_class.dex_bonus ? '+GES' : ''}</span>
        {:else if fullItem?.rarity}
          <span class="item-inline-info">{formatRarity(fullItem.rarity)}</span>
        {/if}
        <button class="row-remove" onclick={() => removeItem(i)}>×</button>
      </div>
    {/each}
  </div>
  <div class="add-row">
    <div class="autocomplete-wrap">
      <input class="add-input" bind:value={newItem} placeholder="Gegenstand"
        oninput={onInput}
        onkeydown={nav.onkeydown}
        onblur={() => setTimeout(() => { suggestions = []; }, 150)} />
      {#if suggestions.length > 0}
        <ul class="suggestions">
          {#each suggestions as sug, i}
            <li class:active={i === nav.index}
              onmousedown={() => select(sug)}>
              <span style="color:{CATEGORY_COLORS[sug.item.category] ?? 'inherit'}">{displayName(sug.item)}</span>
              <span class="sug-level">{sug.dir}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <button class="add-btn" onclick={addItem}>+</button>
  </div>
</div>

<ItemTooltip item={tip.data} x={tip.x} y={tip.y} />

<style>
  .item-list {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-bottom: 0.35rem;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
  }

  .item-name { flex: 1; color: var(--ink); }
  .item-linked { cursor: pointer; }
  .item-linked:hover { color: var(--red); text-decoration: underline; text-decoration-style: dotted; }

  .item-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .item-inline-info {
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-style: italic;
    flex-shrink: 0;
  }
</style>
