<script lang="ts">
  import type { Item } from '$lib/types';
  import { dirOf, structuralType } from '$lib/itemLibrary';
  import { CATEGORY_LABELS, DAMAGE_TYPE_LABELS, PROPERTY_LABELS, MASTERY_INFO, masteryLabel, WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, ARMOR_CATEGORY_LABELS } from '$lib/itemLabels';
  import { formatCost, formatRarity, formatDamageDice, ftToM } from '$lib/itemFormat';
  import { sourceLabel } from '$lib/schemas/source';
  import Markdown from '../Markdown.svelte';

  let { item, color, parseError }: { item: Item | null; color: string; parseError: string | null } = $props();
</script>

{#if item}
  {@const stype = structuralType(item)}
  {@const cat = dirOf(item)}
  <div class="cards-wrap">
    <div class="item-card-view" style="--c: {color}">
      <div class="head">
        <div class="name">{item.name_de ?? item.name}</div>
        {#if item.name_de}<div class="name-en">{item.name}</div>{/if}
        <div class="meta">
          {#if item.rarity}{formatRarity(item.rarity)} · {/if}{CATEGORY_LABELS[cat] ?? item.equipment_category?.name ?? ''}
        </div>
        {#if stype === 'weapon' && (item.weapon_category || item.weapon_range)}
          <div class="subtype">
            {#if item.weapon_category}{WEAPON_CATEGORY_LABELS[item.weapon_category] ?? item.weapon_category}{/if}{#if item.weapon_category && item.weapon_range} · {/if}{#if item.weapon_range}{WEAPON_RANGE_LABELS[item.weapon_range] ?? item.weapon_range}{/if}
          </div>
        {:else if stype === 'armor' && item.armor_category}
          <div class="subtype">{ARMOR_CATEGORY_LABELS[item.armor_category] ?? item.armor_category}</div>
        {/if}
        {#if item.attunement}
          <div class="attune">Einstimmung erforderlich{item.attunement_by ? ` (${item.attunement_by})` : ''}</div>
        {/if}
      </div>

      <div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>

      {#if stype === 'weapon'}
        <div class="props">
          {#if item.damage}
            <div class="prop"><span class="plabel">Schaden</span>
              <span>{formatDamageDice(item.damage.damage_dice)} {DAMAGE_TYPE_LABELS[item.damage.damage_type.index] ?? item.damage.damage_type.name}{#if item.two_handed_damage} · {formatDamageDice(item.two_handed_damage.damage_dice)} (zweih.){/if}</span>
            </div>
          {/if}
          {#if item.range}
            <div class="prop"><span class="plabel">Reichweite</span><span>{ftToM(item.range.normal)}{item.range.long ? ` / ${ftToM(item.range.long)}` : ''}</span></div>
          {/if}
          {#if item.throw_range}
            <div class="prop"><span class="plabel">Wurfweite</span><span>{ftToM(item.throw_range.normal)} / {ftToM(item.throw_range.long)}</span></div>
          {/if}
          {#if item.magic_bonus}
            <div class="prop"><span class="plabel">Bonus</span><span>+{item.magic_bonus} auf Angriff &amp; Schaden</span></div>
          {/if}
          {#if item.properties?.length}
            <div class="prop"><span class="plabel">Eigensch.</span>
              <span class="pills">{#each item.properties as prop}<span class="pill">{PROPERTY_LABELS[prop.index] ?? prop.name}</span>{/each}</span>
            </div>
          {/if}
          <!-- Meisterschaft: bei Waffen IMMER eine Zeile — ohne Eintrag ein Hinweis
               statt stiller Leere, damit die Pflege-Lücke sichtbar bleibt. -->
          <div class="prop"><span class="plabel">Meisterschaft</span>
            {#if item.mastery}
              <span class="pills"><span class="pill mastery-pill" title={MASTERY_INFO[item.mastery].descDe}>{masteryLabel(item.mastery)}</span></span>
            {:else}
              <span class="mastery-missing">— nicht gepflegt</span>
            {/if}
          </div>
        </div>
        <div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>

      {:else if stype === 'armor' && (item.armor_class || item.str_minimum || item.stealth_disadvantage)}
        <div class="props">
          {#if item.armor_class}
            <div class="prop"><span class="plabel">RK</span><span>{item.armor_class.base}{#if item.armor_class.dex_bonus} + GES-Mod{item.armor_class.max_bonus != null ? ` (max. ${item.armor_class.max_bonus})` : ''}{/if}</span></div>
          {/if}
          {#if item.str_minimum}
            <div class="prop"><span class="plabel">Stärke</span><span>mind. {item.str_minimum}</span></div>
          {/if}
          {#if item.stealth_disadvantage}
            <div class="prop"><span class="plabel">Heimlichkeit</span><span class="disadv">Nachteil</span></div>
          {/if}
        </div>
        <div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>
      {/if}

      {#if item.desc_de?.length}
        <div class="desc"><Markdown source={item.desc_de} /></div>
        {#if item.desc?.length}
          <details class="desc-orig">
            <summary>Original (Englisch)</summary>
            <div class="desc-orig-body"><Markdown source={item.desc} /></div>
          </details>
        {/if}
      {:else if item.desc?.length}
        <div class="desc"><Markdown source={item.desc} /></div>
      {:else}
        <div class="desc muted">—</div>
      {/if}

      <div class="foot">
        <span class="src">{sourceLabel(item.source)}</span>
        <span class="foot-right">
          {#if item.cost}{formatCost(item.cost)}{/if}{#if item.cost && item.weight != null} · {/if}{#if item.weight != null}{item.weight} Pfd.{/if}
        </span>
      </div>
    </div>
  </div>
{:else if parseError}
  <div class="error">
    <div class="error-title">Ungültiges JSON — Gegenstand kann nicht angezeigt werden</div>
    <pre class="error-detail">{parseError}</pre>
  </div>
{:else}
  <div class="error">Gegenstand konnte nicht geladen werden.</div>
{/if}

<style>
  .cards-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; }

  .item-card-view {
    width: 100%;
    max-width: 420px;
    background: var(--bg);
    border: 1.5px solid var(--c);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 16px rgba(0,0,0,0.23);
    display: flex;
    flex-direction: column;
    color: var(--ink);
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    position: relative;
    height: fit-content;
  }
  .item-card-view::after {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
    border-radius: 5px;
    pointer-events: none;
  }

  .item-card-view .head {
    padding: 0.9rem 1.2rem 0.65rem;
    text-align: center;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--c) 50%, var(--bg)) 0%,
      color-mix(in srgb, var(--c) 9%, var(--bg)) 100%);
  }
  .item-card-view .name {
    font-size: 1.15rem;
    font-weight: 700;
    font-variant: small-caps;
    color: var(--ink);
    line-height: 1.2;
    letter-spacing: 0.02em;
  }
  .item-card-view .name-en {
    font-size: 0.78rem;
    font-style: italic;
    color: var(--ink-soft);
    margin-top: 0.1rem;
  }
  .item-card-view .meta {
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--c) 75%, var(--ink));
    margin-top: 0.25rem;
    font-style: italic;
  }
  .item-card-view .subtype {
    font-size: 0.72rem;
    color: var(--ink-muted);
    margin-top: 0.1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .item-card-view .attune {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--c);
    margin-top: 0.3rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .item-card-view .orndiv {
    display: flex; align-items: center; gap: 4px; margin: 0.5rem 10px 0; flex-shrink: 0;
  }
  .item-card-view .ol {
    flex: 1; height: 1px;
    background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .item-card-view .og { font-size: 0.6rem; color: var(--c); line-height: 1; }

  .item-card-view .props {
    padding: 0.55rem 1.2rem 0.2rem;
    display: flex; flex-direction: column; gap: 0.3rem;
    font-size: 0.84rem; line-height: 1.4;
  }
  .item-card-view .prop {
    display: grid; grid-template-columns: 6rem 1fr; gap: 0.5rem; align-items: baseline;
  }
  .item-card-view .plabel {
    color: var(--ink-muted); font-size: 0.72rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .item-card-view .pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .item-card-view .pill {
    background: color-mix(in srgb, var(--c) 12%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
    border-radius: 99px; font-size: 0.7rem; padding: 0.05rem 0.5rem; color: var(--ink-soft);
  }
  .item-card-view .disadv { color: var(--danger); }
  .item-card-view .mastery-pill {
    border-color: color-mix(in srgb, var(--c) 60%, transparent);
    color: var(--ink); font-weight: 600; cursor: help;
  }
  .item-card-view .mastery-missing { color: var(--border); font-size: 0.78rem; font-style: italic; }

  .item-card-view .desc {
    padding: 0.55rem 1.2rem;
    font-size: 0.84rem; line-height: 1.6; color: var(--ink);
  }
  .item-card-view .desc.muted { color: var(--border); }
  .item-card-view .desc-orig { padding: 0 1.2rem 0.5rem; }
  .item-card-view .desc-orig summary {
    font-size: 0.72rem; color: var(--ink-muted); cursor: pointer; user-select: none;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .item-card-view .desc-orig-body {
    margin-top: 0.4rem; font-size: 0.8rem; color: var(--ink-muted); line-height: 1.55;
    font-style: italic;
  }

  .item-card-view .foot {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.45rem 1.2rem; margin-top: auto;
    border-top: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
    background: color-mix(in srgb, var(--c) 6%, var(--bg));
    font-size: 0.72rem; color: var(--ink-muted); font-style: italic;
  }
  .item-card-view .src { text-transform: uppercase; letter-spacing: 0.05em; }

  .error { color: var(--danger); padding: 2rem; font-size: 0.9rem; }
  .error-title { font-weight: 600; margin-bottom: 0.6rem; }
  .error-detail {
    font-family: monospace; font-size: 0.8rem; color: var(--copper);
    background: var(--bg-panel); border: 1px solid var(--surface); border-radius: 4px;
    padding: 0.6rem 0.8rem; white-space: pre-wrap; word-break: break-all; margin: 0;
  }
</style>
