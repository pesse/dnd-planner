<script lang="ts">
  /**
   * Inventar: Zeilen mit Bibliotheks-Link (Autocomplete, Tooltip, Sprung zur Karte),
   * Gewicht je Stück aus der Bibliothek und die live gerechnete Gesamtlast.
   */
  import { invoke } from '@tauri-apps/api/core';
  import { openItemPage } from '../../services/vaultLinks';
  import {
    searchItems, displayName, matchItem, type ItemIndex, type ItemInfo, type ItemSuggestion,
  } from '../../itemLibrary';
  import { CATEGORY_COLORS } from '../../itemLabels';
  import { lineWeightKg, totalWeightKg, formatKg } from '../../utils/inventoryWeight';
  import { classifyChange, diffMark, type DiffDir } from '../../utils/diffHighlight';
  import ItemTooltip from '../ItemTooltip.svelte';
  import type { Character } from '../../schemas/characterSchema';
  import type { Item } from '../../types';
  import './form.css';

  type InventoryLine = Character['inventory'][number];

  let {
    inventory, inventoryNotes = $bindable(), itemIndex, itemsByDir, saved, fixLabel, onfix, dirOf,
  }: {
    inventory: InventoryLine[];
    inventoryNotes: string;
    itemIndex: ItemIndex;
    itemsByDir: Record<string, ItemInfo[]>;
    saved?: Character | null;
    fixLabel?: string;
    onfix: () => void;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  let suggestions = $state<ItemSuggestion[]>([]);
  let sugIndex = $state(-1);
  let activeRow = $state(-1);
  /** Zeile, die trotz Link gerade neu getippt wird (✎). */
  let editingRow = $state(-1);

  const totalWeight = $derived(totalWeightKg(inventory));
  const libItemOf = (line: InventoryLine): ItemInfo | undefined => matchItem(itemIndex, line);

  function onNameInput(i: number, value: string) {
    inventory[i].sourceKey = undefined; // getippter Name ≠ verlinkter Gegenstand
    // Hält die Zeile im Eingabefeld: sonst klappt sie mitten im Wort zur Link-Ansicht
    // um, sobald der Zwischenstand zufällig einen Bibliotheksnamen trifft.
    editingRow = i;
    activeRow = i;
    suggestions = searchItems(itemsByDir, value, 8);
    sugIndex = -1;
  }

  function selectItem(i: number, sug: ItemSuggestion) {
    inventory[i].name = displayName(sug.item); // deutscher Name, fällt auf Original zurück
    inventory[i].sourceKey = sug.item.key;
    // Überschreibt auch einen getippten Wert, und leert bei Items ohne Gewicht: „kein
    // Gewicht" ist eine Aussage der Bibliothek (Würfel), kein fehlender Wert.
    inventory[i].weight = sug.item.weight != null ? String(sug.item.weight) : '';
    suggestions = [];
    activeRow = -1;
    sugIndex = -1;
    editingRow = -1;
  }

  function onNameKey(e: KeyboardEvent, i: number) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sugIndex = Math.min(sugIndex + 1, suggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sugIndex = Math.max(sugIndex - 1, -1); }
    else if (e.key === 'Escape') { suggestions = []; activeRow = -1; editingRow = -1; }
    else if (e.key === 'Enter' && sugIndex >= 0 && suggestions[sugIndex]) {
      e.preventDefault();
      selectItem(i, suggestions[sugIndex]);
    }
  }

  function divergedName(line: InventoryLine): string | undefined {
    const key = line.sourceKey?.trim();
    if (!key) return undefined;
    const hit = itemIndex.byKey.get(key);
    if (!hit) return undefined;
    const canonical = displayName(hit);
    return canonical.trim() !== line.name.trim() ? canonical : undefined;
  }

  const divergedCount = $derived(inventory.filter((line) => divergedName(line)).length);

  function syncNames() {
    for (const line of inventory) {
      const canonical = divergedName(line);
      if (canonical) line.name = canonical;
    }
  }

  // Vorab laden, damit der Tooltip ohne Verzögerung erscheint.
  let dataByPath = $state(new Map<string, Item | null>());
  let tooltip = $state<Item | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  $effect(() => {
    for (const line of inventory) {
      const lib = libItemOf(line);
      if (!lib || dataByPath.has(lib.path)) continue;
      dataByPath.set(lib.path, null);
      dataByPath = new Map(dataByPath);
      invoke<string>('read_file_content', { path: lib.path })
        .then((content) => {
          dataByPath.set(lib.path, JSON.parse(content) as Item);
          dataByPath = new Map(dataByPath);
        })
        .catch(() => {});
    }
  });

  function showTooltip(e: MouseEvent, lib: ItemInfo) {
    const data = dataByPath.get(lib.path);
    if (!data) return;
    tooltip = data;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function moveTooltip(e: MouseEvent) {
    if (!tooltip) return;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  const hideTooltip = () => (tooltip = null);
</script>

<table class="inv-table">
  <thead><tr><th>Gegenstand</th><th>Anz.</th><th>Gew./St. (kg)</th><th class="inv-line-col">Zeile</th><th></th></tr></thead>
  <tbody>
    {#each inventory as item, i}
      {@const invDir = !saved || !item.name.trim() ? 'none'
        : i >= (saved.inventory?.length ?? 0) ? 'up'
        : classifyChange($state.snapshot(saved.inventory[i]), $state.snapshot(item))}
      {@const lib = libItemOf(item)}
      <tr use:diffMark={invDir}>
        <td class="inv-name-cell">
          {#if lib && editingRow !== i}
            <!-- Kein Eingabefeld: freies Tippen läuft über ✎, sonst löst jeder
                 Tastendruck in einer verlinkten Zeile den Link. -->
            <span class="inv-linked-name">
              <span class="inv-dot" style="background:{CATEGORY_COLORS[lib.category] ?? 'var(--border-strong)'}"></span>
              <button
                type="button"
                class="inv-name-link"
                title="Gegenstandskarte öffnen"
                onclick={() => openItemPage(lib)}
                onmouseenter={(e) => showTooltip(e, lib)}
                onmousemove={moveTooltip}
                onmouseleave={hideTooltip}
              >{item.name}</button>
              {#if divergedName(item)}
                <span class="name-diverged" title="Bibliothek: {divergedName(item)}">≠</span>
              {/if}
              <button type="button" class="link-edit" title="Anderen Gegenstand wählen oder frei benennen"
                onclick={() => { editingRow = i; hideTooltip(); }}>✎</button>
              {#if !item.sourceKey?.trim() && itemIndex.ambiguous.has(item.name.trim().toLowerCase())}
                <!-- Angezeigt wird der erste Treffer, der womöglich falsche — daher
                     der Hinweis statt eines automatischen Links. -->
                <span class="inv-ambiguous" title="Mehrere Gegenstände dieses Namens — über ✎ den richtigen wählen">mehrdeutig</span>
              {/if}
            </span>
          {:else}
            <div class="autocomplete-wrap">
              <input
                value={item.name}
                placeholder="Seil (15m)"
                oninput={(e) => { item.name = e.currentTarget.value; onNameInput(i, item.name); }}
                onkeydown={(e) => onNameKey(e, i)}
                onblur={() => setTimeout(() => {
                  if (activeRow === i) { suggestions = []; activeRow = -1; }
                  if (editingRow === i) editingRow = -1;
                }, 150)}
              />
              {#if activeRow === i && suggestions.length > 0}
                <ul class="suggestions">
                  {#each suggestions as sug, si}
                    <li class:active={si === sugIndex} onmousedown={() => selectItem(i, sug)}>
                      <span style="color:{CATEGORY_COLORS[sug.item.category] ?? 'inherit'}">{displayName(sug.item)}</span>
                      <span class="sug-cat">{sug.dir}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        </td>
        <!-- Kein bind:value: `count` ist ein String (PDF-Feld, leer = unbestimmt),
             bind würde bei type="number" eine Zahl zurückschreiben. -->
        <td><input class="num-input" type="number" min="1" step="1" inputmode="numeric" placeholder="1"
          value={item.count}
          oninput={(e) => { item.count = e.currentTarget.value; }} /></td>
        {#if item.sourceKey?.trim() && lib}
          <!-- Bedingung ist der ECHTE Link, nicht der Namenstreffer: sonst wären
               getippte Gewichte im Altbestand gesperrt, ehe verlinkt wurde. -->
          <td class="inv-fixed-cell" title="Gewicht kommt aus der Bibliothek — über die Gegenstandskarte änderbar">{item.weight || '—'}</td>
        {:else}
          <td><input bind:value={item.weight} placeholder="2" /></td>
        {/if}
        <td class="inv-line-cell num">{lineWeightKg(item) > 0 ? formatKg(lineWeightKg(item)) : '—'}</td>
        <td><button class="remove-btn" onclick={() => { inventory.splice(i, 1); editingRow = -1; }}>✕</button></td>
      </tr>
    {/each}
  </tbody>
  {#if inventory.length}
    <tfoot>
      <tr class="inv-total-row">
        <td colspan="3">Gesamtlast</td>
        <td class="num"><strong>{totalWeight > 0 ? formatKg(totalWeight) + ' kg' : '—'}</strong></td>
        <td></td>
      </tr>
    </tfoot>
  {/if}
</table>
<div class="inv-actions">
  <button class="btn-add" onclick={() => { inventory.push({ name: '', sourceKey: undefined, count: '', weight: '' }); editingRow = inventory.length - 1; }}>+ Gegenstand</button>
  {#if fixLabel}
    <button class="btn-link-all" onclick={onfix}
      title="Setzt bei diesen Zeilen den Bibliotheks-Link. Wird beim Speichern übernommen.">
      🔗 {fixLabel}
    </button>
  {/if}
  {#if divergedCount > 0}
    <button class="btn-link-all" onclick={syncNames}
      title="Diese Zeilen sind verlinkt, ihr Name weicht aber vom Bibliothekseintrag ab. Übernimmt den Bibliotheksnamen.">
      ✎ {divergedCount} Namen an die Bibliothek angleichen
    </button>
  {/if}
</div>
<label style="display:block; margin-top:0.5rem" use:diffMark={dirOf(saved?.inventoryNotes, inventoryNotes)}>
  Notizen
  <textarea class="ta-small" bind:value={inventoryNotes}></textarea>
</label>

<ItemTooltip item={tooltip} x={tooltipX} y={tooltipY} />
