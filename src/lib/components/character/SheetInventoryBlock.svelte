<script lang="ts">
  import './sheet.css';
  import { openItemPage } from '../../services/vaultLinks';
  import { displayName, matchItem, structuralType, type ItemIndex } from '../../itemLibrary';
  import { CATEGORY_COLORS } from '../../itemLabels';
  import { formatRarity, weaponDamageLine } from '../../itemFormat';
  import { lineWeightKg, totalWeightKg, formatKg } from '../../utils/inventoryWeight';
  import { createItemHover } from '../itemHover.svelte';
  import ItemTooltip from '../ItemTooltip.svelte';
  import type { Character } from '../../schemas/characterSchema';

  let { character, itemIndex }: { character: Character; itemIndex: ItemIndex } = $props();

  const libOf = (line: { name: string; sourceKey?: string }) => matchItem(itemIndex, line);

  // Volldaten vorab laden: der Tooltip soll ohne Verzögerung erscheinen, und die
  // Waffen-/Rüstungszeile in der Tabelle hängt an denselben Daten.
  const hover = createItemHover(() =>
    character.inventory.map((i) => libOf(i)?.path).filter((p): p is string => !!p),
  );
</script>

<div class="section">
  <h3>Inventar</h3>
  <div class="currency-row">
    {#each [['KM','Kupfer'],['SM','Silber'],['EM','Elektrum'],['GM','Gold'],['PM','Platin']] as [key, label]}
      {@const val = (character.currency as unknown as Record<string, string>)[key.toLowerCase()]}
      <div class="coin" class:empty={!val}>
        <span class="coin-val">{val || '—'}</span>
        <span class="coin-lbl">{key}</span>
      </div>
    {/each}
  </div>

  {#if character.inventory.length}
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anz.</th><th>Gew.</th></tr></thead>
      <tbody>
        {#each character.inventory as item}
          {@const libItem = libOf(item)}
          {@const fullItem = libItem ? hover.data(libItem.path) : null}
          <tr
            class:inv-linked={!!libItem}
            onclick={() => libItem && openItemPage(libItem)}
            onmouseenter={(e) => libItem && hover.show(e, libItem.path)}
            onmousemove={(e) => hover.move(e)}
            onmouseleave={() => hover.hide()}
          >
            <td>
              {#if libItem}
                <span class="inv-dot" style="background:{CATEGORY_COLORS[libItem.category] ?? 'var(--border-strong)'}"></span>
              {/if}
              {libItem ? displayName(libItem) : item.name}
              {#if fullItem && structuralType(fullItem) === 'weapon' && fullItem.damage}
                <span class="inv-weapon-info">{weaponDamageLine(fullItem, true)}</span>
              {:else if fullItem && structuralType(fullItem) === 'armor' && fullItem.armor_class}
                <span class="inv-weapon-info">RK {fullItem.armor_class.base}{fullItem.armor_class.dex_bonus ? '+GES' : ''}</span>
              {:else if fullItem?.rarity}
                <span class="inv-weapon-info">{formatRarity(fullItem.rarity)}</span>
              {/if}
            </td>
            <td class="num">{item.count || '—'}</td>
            <td class="num">{lineWeightKg(item) > 0 ? formatKg(lineWeightKg(item)) + ' kg' : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if totalWeightKg(character.inventory) > 0}
      <div class="weight-total">Gesamtlast: <strong>{formatKg(totalWeightKg(character.inventory))} kg</strong></div>
    {/if}
  {:else}
    <span class="empty-hint">Kein Inventar eingetragen</span>
  {/if}

  {#if character.inventoryNotes}
    <p class="preformatted" style="margin-top: 0.5rem">{character.inventoryNotes}</p>
  {/if}
</div>

<ItemTooltip item={hover.item} x={hover.x} y={hover.y} />

<style>
  .currency-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .coin {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    text-align: center;
    min-width: 46px;
  }
  .coin.empty { opacity: 0.4; }
  .coin-val { display: block; font-weight: 700; font-size: 0.95rem; color: var(--gold); }
  .coin-lbl { display: block; font-size: 0.65rem; color: var(--ink-muted); text-transform: uppercase; }

  .inv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    margin-bottom: 0.4rem;
  }
  .inv-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.15rem 0.4rem 0.15rem 0;
    border-bottom: 1px solid var(--surface);
  }
  .inv-table td {
    padding: 0.2rem 0.4rem 0.2rem 0;
    color: var(--ink);
    border-bottom: 1px solid var(--bg);
  }
  .inv-table td.num { color: var(--ink-soft); text-align: right; padding-right: 0.75rem; }

  .inv-linked { cursor: pointer; }
  .inv-linked:hover td { background: var(--bg); filter: brightness(1.15); }

  .inv-weapon-info {
    margin-left: 0.4rem;
    font-size: 0.74rem;
    color: var(--ink-muted);
    font-style: italic;
  }

  .weight-total {
    font-size: 0.78rem;
    color: var(--ink-muted);
    text-align: right;
    margin-top: 0.2rem;
  }
  .weight-total strong { color: var(--ink-soft); }

  .empty-hint {
    font-size: 0.8rem;
    color: var(--border);
    font-style: italic;
  }
</style>
