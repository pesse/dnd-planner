<script lang="ts">
  import type { Item } from '../types';
  import {
    PROPERTY_LABELS, WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, ARMOR_CATEGORY_LABELS,
    DAMAGE_TYPE_LABELS, formatCost, formatRarity, formatDamageDice, ftToM, masteryLabel,
    structuralType,
  } from '../itemLibrary';
  import Markdown from './Markdown.svelte';

  let { item, x, y }: { item: Item | null; x: number; y: number } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  // x/y ist der vom Aufrufer gesetzte Anker (Cursor + Offset), wie beim Zauber-Tooltip;
  // am Viewport-Rand umklappen, sonst schneiden lange Magie-Beschreibungen ab.
  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));

  function properties(i: Item): string {
    return (i.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
  }
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if item}
  {@const kind = structuralType(item)}
  <div
    class="item-tooltip"
    style="left:{left}px;top:{top}px"
    bind:clientWidth={boxW}
    bind:clientHeight={boxH}
  >
    <div class="tt-name">
      {item.name_de ?? item.name}
      {#if item.name_de}<span class="tt-name-en">{item.name}</span>{/if}
      {#if item.attunement}<span class="tt-badge tt-attune">Einstellung</span>{/if}
    </div>

    <div class="tt-meta">
      {#if kind === 'weapon'}
        {WEAPON_CATEGORY_LABELS[item.weapon_category ?? ''] ?? item.weapon_category}
        · {WEAPON_RANGE_LABELS[item.weapon_range ?? ''] ?? item.weapon_range}
      {:else if kind === 'armor'}
        {ARMOR_CATEGORY_LABELS[item.armor_category ?? ''] ?? item.armor_category}
      {:else if item.rarity}
        {formatRarity(item.rarity)}{#if item.attunement_by} · für {item.attunement_by}{/if}
      {/if}
    </div>

    {#if kind === 'weapon' && item.damage}
      <div class="tt-section">
        <span class="tt-label">Schaden</span>
        <span>{formatDamageDice(item.damage.damage_dice)}
          {DAMAGE_TYPE_LABELS[item.damage.damage_type.index] ?? item.damage.damage_type.name}
          {#if item.two_handed_damage}· Zweihändig: {formatDamageDice(item.two_handed_damage.damage_dice)}{/if}
        </span>
      </div>
      {#if item.range}
        <div class="tt-section">
          <span class="tt-label">Reichweite</span>
          <span>{ftToM(item.range.normal)}{item.range.long ? ` / ${ftToM(item.range.long)}` : ''}</span>
        </div>
      {/if}
      {#if item.throw_range}
        <div class="tt-section">
          <span class="tt-label">Wurfweite</span>
          <span>{ftToM(item.throw_range.normal)} / {ftToM(item.throw_range.long)}</span>
        </div>
      {/if}
      {#if properties(item)}
        <div class="tt-section">
          <span class="tt-label">Eigenschaften</span>
          <span>{properties(item)}</span>
        </div>
      {/if}
      {#if item.mastery}
        <div class="tt-section">
          <span class="tt-label">Meisterschaft</span>
          <span>{masteryLabel(item.mastery)}</span>
        </div>
      {/if}
    {:else if kind === 'armor' && item.armor_class}
      <div class="tt-section">
        <span class="tt-label">Rüstungsklasse</span>
        <span>{item.armor_class.base}{item.armor_class.dex_bonus ? ' + GES-Mod' : ''}{item.armor_class.max_bonus != null ? ` (max. ${item.armor_class.max_bonus})` : ''}</span>
      </div>
      {#if item.str_minimum}
        <div class="tt-section">
          <span class="tt-label">Mindest-STR</span>
          <span>{item.str_minimum}</span>
        </div>
      {/if}
      {#if item.stealth_disadvantage}
        <div class="tt-note">Nachteil auf Heimlichkeit</div>
      {/if}
    {/if}

    {#if item.cost || item.weight}
      <div class="tt-section tt-footer">
        {#if item.cost}<span>{formatCost(item.cost)}</span>{/if}
        {#if item.cost && item.weight}<span class="tt-sep">·</span>{/if}
        {#if item.weight}<span>{item.weight} lb</span>{/if}
      </div>
    {/if}

    {#if (item.desc_de ?? item.desc)?.length}
      <div class="tt-divider"></div>
      <div class="tt-desc"><Markdown source={item.desc_de ?? item.desc} /></div>
    {/if}
  </div>
{/if}

<style>
  .item-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 200px;
    max-width: 320px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }
  .tt-name {
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--ink);
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.2rem;
  }
  .tt-name-en {
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-weight: 400;
    font-style: italic;
  }
  .tt-badge {
    font-size: 0.68rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-weight: 500;
    line-height: 1.4;
  }
  .tt-attune {
    background: color-mix(in srgb, var(--arcane) 13%, transparent);
    color: var(--arcane);
    border: 1px solid color-mix(in srgb, var(--arcane) 25%, transparent);
  }
  .tt-meta {
    font-size: 0.74rem;
    color: var(--red);
    margin-bottom: 0.45rem;
  }
  .tt-section {
    display: flex;
    gap: 0.5rem;
    font-size: 0.78rem;
    margin-bottom: 0.15rem;
    align-items: baseline;
  }
  .tt-label {
    color: var(--ink-muted);
    flex-shrink: 0;
    min-width: 70px;
    font-size: 0.72rem;
  }
  .tt-footer { margin-top: 0.35rem; color: var(--ink-muted); flex-wrap: wrap; }
  .tt-sep { color: var(--border); }
  .tt-note { font-size: 0.74rem; color: var(--danger); margin-bottom: 0.1rem; }
  .tt-divider { border-top: 1px solid var(--surface); margin: 0.45rem 0; }
  .tt-desc {
    margin: 0 0 0.3rem;
    font-size: 0.77rem;
    color: var(--ink-soft);
    line-height: 1.45;
  }
</style>
