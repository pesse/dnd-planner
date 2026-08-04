<script lang="ts">
  /**
   * Inventar: Zeilen mit Bibliotheks-Link (Autocomplete, Tooltip, Sprung zur Karte),
   * Gewicht je Stück aus der Bibliothek und die live gerechnete Gesamtlast. Waffenzeilen
   * schalten ihren Eintrag in der Angriffstabelle um (⚔).
   */
  import { invoke } from '@tauri-apps/api/core';
  import { openItemPage } from '../../services/vaultLinks';
  import {
    searchItems, displayName, matchItem, type ItemIndex, type ItemInfo, type ItemSuggestion,
  } from '../../itemLibrary';
  import { CATEGORY_COLORS } from '../../itemLabels';
  import {
    attackIndexOf, buildAttackFromWeapon, type WeaponAttackContext,
  } from '../../services/attackCalc';
  import { lineWeightKg, totalWeightKg, formatKg } from '../../utils/inventoryWeight';
  import { classifyChange, diffMark, type DiffDir } from '../../utils/diffHighlight';
  import { createSuggestNav } from '../../utils/suggestNav.svelte';
  import { dropdownPlacement } from '../../utils/dropdownPlacement';
  import { createHoverTip } from '../../utils/hoverTip.svelte';
  import ItemTooltip from '../ItemTooltip.svelte';
  import type { Attack, Character } from '../../schemas/characterSchema';
  import type { Item } from '../../types';
  import './form.css';

  type InventoryLine = Character['inventory'][number];

  let {
    inventory, inventoryNotes = $bindable(), itemIndex, itemsByDir, attacks, attackCtx,
    saved, fixLabel, onfix, dirOf,
  }: {
    inventory: InventoryLine[];
    inventoryNotes: string;
    itemIndex: ItemIndex;
    itemsByDir: Record<string, ItemInfo[]>;
    attacks: Attack[];
    attackCtx: WeaponAttackContext;
    saved?: Character | null;
    fixLabel?: string;
    onfix: () => void;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  let suggestions = $state<ItemSuggestion[]>([]);
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
    nav.reset();
  }

  function selectItem(i: number, sug: ItemSuggestion) {
    inventory[i].name = displayName(sug.item); // deutscher Name, fällt auf Original zurück
    inventory[i].sourceKey = sug.item.key;
    // Überschreibt auch einen getippten Wert, und leert bei Items ohne Gewicht: „kein
    // Gewicht" ist eine Aussage der Bibliothek (Würfel), kein fehlender Wert.
    inventory[i].weight = sug.item.weight != null ? String(sug.item.weight) : '';
    suggestions = [];
    activeRow = -1;
    nav.reset();
    editingRow = -1;
  }

  // Die Liste hängt immer an `activeRow` — ein Treffer kann keine andere Zeile meinen.
  const nav = createSuggestNav<ItemSuggestion>({
    items: () => suggestions,
    pick: (sug) => selectItem(activeRow, sug),
    escape: () => { suggestions = []; activeRow = -1; editingRow = -1; },
  });

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
  const tip = createHoverTip<Item>();

  async function loadItem(path: string): Promise<Item | null> {
    const cached = dataByPath.get(path);
    if (cached) return cached;
    try {
      const data = JSON.parse(await invoke<string>('read_file_content', { path })) as Item;
      dataByPath.set(path, data);
      dataByPath = new Map(dataByPath);
      return data;
    } catch {
      return null;
    }
  }

  $effect(() => {
    for (const line of inventory) {
      const lib = libItemOf(line);
      if (!lib || dataByPath.has(lib.path)) continue;
      dataByPath.set(lib.path, null); // belegt den Platz, sonst lädt der nächste Lauf erneut
      dataByPath = new Map(dataByPath);
      void loadItem(lib.path);
    }
  });

  // Identität über den Bibliothekseintrag, nicht über den Zeilentext: ein umbenanntes
  // „Langschwert +1" im Inventar meint denselben Angriff wie die Waffe, aus der er kam.
  const attackRefOf = (lib: ItemInfo) => ({ sourceKey: lib.key, name: displayName(lib) });

  async function toggleAttack(lib: ItemInfo) {
    const at = attackIndexOf(attacks, attackRefOf(lib));
    if (at >= 0) { attacks.splice(at, 1); return; }
    const data = await loadItem(lib.path);
    if (data) attacks.push(buildAttackFromWeapon(data, attackCtx));
  }

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
              {#if lib.category === 'weapon'}
                {@const inAttacks = attackIndexOf(attacks, attackRefOf(lib)) >= 0}
                <button type="button" class="atk-toggle" class:active={inAttacks}
                  title={inAttacks ? 'Aus der Angriffe-Tabelle entfernen' : 'In die Angriffe-Tabelle eintragen'}
                  onclick={() => toggleAttack(lib)}>⚔</button>
              {/if}
              <button
                type="button"
                class="inv-name-link"
                title="Gegenstandskarte öffnen"
                onclick={() => openItemPage(lib)}
                onmouseenter={(e) => tip.show(e, dataByPath.get(lib.path) ?? null)}
                onmousemove={tip.move}
                onmouseleave={tip.hide}
              >{item.name}</button>
              {#if divergedName(item)}
                <span class="name-diverged" title="Bibliothek: {divergedName(item)}">≠</span>
              {/if}
              <button type="button" class="link-edit" title="Anderen Gegenstand wählen oder frei benennen"
                onclick={() => { editingRow = i; tip.hide(); }}>✎</button>
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
                onkeydown={nav.onkeydown}
                onblur={() => setTimeout(() => {
                  if (activeRow === i) { suggestions = []; activeRow = -1; }
                  if (editingRow === i) editingRow = -1;
                }, 150)}
              />
              {#if activeRow === i && suggestions.length > 0}
                <ul class="suggestions" use:dropdownPlacement>
                  {#each suggestions as sug, si}
                    <li class:active={si === nav.index} onmousedown={() => selectItem(i, sug)}>
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

<ItemTooltip item={tip.data} x={tip.x} y={tip.y} />
