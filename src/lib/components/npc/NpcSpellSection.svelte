<script lang="ts">
  /**
   * Zauberliste eines NPC: aufklappbare Karte je Zauber (Daten aus der Bibliothek,
   * nachgeladen beim ersten Aufklappen) und eine Autocomplete-Zeile zum Anlegen.
   */
  import {
    getSpellLibrary, loadSpellByPath, searchSpells, SCHOOL_COLORS, type SpellSuggestion,
  } from '../../spellLibrary';
  import { spellDesc, spellHigherLevel, spellComponents, spellSchoolLabel } from '../../types';
  import { createSuggestNav } from '../../utils/suggestNav.svelte';
  import Markdown from '../Markdown.svelte';
  import type { Npc } from '../../schemas/npc';
  import type { Spell } from '../../types';
  import './npcCard.css';

  let { npc }: { npc: Npc } = $props();

  let spellLibrary = $state<Awaited<ReturnType<typeof getSpellLibrary>>>([]);
  $effect(() => { getSpellLibrary().then(lib => { spellLibrary = lib; }); });

  const spellInfoMap = $derived(new Map(spellLibrary.map(s => [s.name, s])));

  let newSpell = $state('');
  let newSpellLevel = $state(1);
  let suggestions = $state<SpellSuggestion[]>([]);

  let expandedSpells = $state(new Set<string>());
  let spellDataCache = $state(new Map<string, Spell | null>());
  let loadingSpells = $state(new Set<string>());

  async function toggleSpellCard(name: string) {
    if (expandedSpells.has(name)) {
      expandedSpells.delete(name);
      expandedSpells = new Set(expandedSpells);
      return;
    }
    expandedSpells.add(name);
    expandedSpells = new Set(expandedSpells);
    if (!spellDataCache.has(name) && !loadingSpells.has(name)) {
      const info = spellInfoMap.get(name);
      if (info?.path) {
        loadingSpells.add(name); loadingSpells = new Set(loadingSpells);
        const data = await loadSpellByPath(info.path);
        spellDataCache.set(name, data); spellDataCache = new Map(spellDataCache);
        loadingSpells.delete(name); loadingSpells = new Set(loadingSpells);
      }
    }
  }

  function onInput() {
    suggestions = newSpell.length > 0 ? searchSpells(spellLibrary, newSpell, null, '') : [];
    nav.reset();
  }

  function select(name: string) {
    newSpell = name;
    suggestions = [];
    nav.reset();
  }

  function addSpell() {
    if (!newSpell.trim()) return;
    npc.spells = [...npc.spells, { name: newSpell.trim(), level: newSpellLevel }];
    newSpell = ''; newSpellLevel = 1; suggestions = [];
  }
  function removeSpell(i: number) {
    npc.spells = npc.spells.filter((_, idx) => idx !== i);
  }

  const nav = createSuggestNav<SpellSuggestion>({
    items: () => suggestions,
    pick: (sug) => select(sug.spell.name),
    enter: addSpell,
    escape: () => { suggestions = []; },
  });
</script>

<div class="section">
  <h3>Zauber</h3>
  <div class="spell-cards">
    {#each npc.spells as spell, i}
      {@const info = spellInfoMap.get(spell.name)}
      {@const color = info ? (SCHOOL_COLORS[info.school] ?? 'var(--border-strong)') : 'var(--border-strong)'}
      {@const expanded = expandedSpells.has(spell.name)}
      {@const data = spellDataCache.get(spell.name) ?? null}
      <div class="scard" class:expanded style="--sc:{color}"
        role="button" tabindex="0"
        onclick={() => toggleSpellCard(spell.name)}
        onkeydown={(e) => e.key === 'Enter' && toggleSpellCard(spell.name)}>
        <div class="scard-head">
          <span class="spell-level-badge">{spell.level === 0 ? 'ZT' : spell.level}</span>
          <span class="scard-name">{spell.name}</span>
          <span class="scard-badges">
            {#if info?.school}<span class="scard-school">{spellSchoolLabel(info.school)}</span>{/if}
          </span>
          <button class="scard-remove" onclick={(e) => { e.stopPropagation(); removeSpell(i); }} title="Entfernen">×</button>
          <span class="scard-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
        {#if expanded}
          <div class="scard-body" onclick={(e) => e.stopPropagation()}>
            {#if loadingSpells.has(spell.name)}
              <span class="scard-loading">Lädt…</span>
            {:else if data}
              <div class="scard-props">
                <span class="sp-label">Zauberdauer</span><span class="sp-val">{data.casting_time}</span>
                <span class="sp-label">Reichweite</span><span class="sp-val">{data.range}</span>
                <span class="sp-label">Komponenten</span><span class="sp-val">{spellComponents(data)}{data.components.materials_needed ? ` (${data.components.materials_needed})` : ''}</span>
                <span class="sp-label">Dauer</span><span class="sp-val">{data.duration}</span>
              </div>
              <div class="scard-divider"></div>
              <div class="scard-desc"><Markdown source={spellDesc(data)} /></div>
              {#if spellHigherLevel(data)}
                <div class="scard-divider"></div>
                <div class="scard-higher"><span class="higher-lbl">Auf höheren Graden.</span> <Markdown source={spellHigherLevel(data)} inline /></div>
              {/if}
            {:else}
              <span class="scard-loading">Nicht in Bibliothek</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
  <div class="add-row">
    <div class="autocomplete-wrap">
      <input class="add-input" bind:value={newSpell} placeholder="Zaubername"
        oninput={onInput}
        onkeydown={nav.onkeydown}
        onblur={() => setTimeout(() => { suggestions = []; }, 150)} />
      {#if suggestions.length > 0}
        <ul class="suggestions">
          {#each suggestions as sug, i}
            <li class:active={i === nav.index}
              onmousedown={() => select(sug.spell.name)}>
              <span style="color:{SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}">{sug.spell.name}</span>
              <span class="sug-level">Grad {sug.spell.level === 0 ? 'ZT' : sug.spell.level}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <input class="add-input add-num" type="number" min="0" max="9" bind:value={newSpellLevel} placeholder="Stufe" />
    <button class="add-btn" onclick={addSpell}>+</button>
  </div>
</div>

<style>
  .spell-cards {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.35rem;
  }

  .scard {
    border-left: 3px solid var(--sc);
    background: var(--bg);
    border-radius: 0 5px 5px 0;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
  }
  .scard:hover { background: var(--bg-raised); }
  .scard.expanded { background: var(--bg-panel); }

  .scard-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem 0.3rem 0.6rem;
    font-size: 0.83rem;
  }

  .spell-level-badge {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--sc);
    background: color-mix(in srgb, var(--sc) 12%, var(--bg));
    border-radius: 3px;
    padding: 0.05rem 0.28rem;
    min-width: 1.4rem;
    text-align: center;
    flex-shrink: 0;
  }

  .scard-name { flex: 1; color: var(--sc); font-weight: 500; }
  .scard-badges { display: flex; gap: 0.3rem; align-items: center; }
  .scard-school {
    font-size: 0.68rem;
    color: var(--border);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .scard-chevron { font-size: 0.55rem; color: var(--border); flex-shrink: 0; }

  .scard-remove {
    background: none;
    border: none;
    color: var(--border);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0 0.15rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .scard-remove:hover { color: var(--danger); }

  .scard-body { padding: 0 0.6rem 0.6rem 0.6rem; cursor: default; }

  .scard-props {
    display: grid;
    grid-template-columns: 7rem 1fr;
    gap: 0.2rem 0.4rem;
    font-size: 0.8rem;
    padding-bottom: 0.5rem;
  }
  .sp-label {
    color: var(--ink-muted);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    align-self: start;
    padding-top: 0.05rem;
  }
  .sp-val { color: var(--ink); line-height: 1.4; }

  .scard-divider { height: 1px; background: var(--surface); margin: 0.4rem 0; }
  .scard-desc { font-size: 0.82rem; color: var(--ink); line-height: 1.6; }
  .scard-higher { font-size: 0.8rem; color: var(--ink-soft); line-height: 1.55; }
  .higher-lbl { color: var(--sc); font-weight: 700; margin-right: 0.3rem; }
  .scard-loading { font-size: 0.78rem; color: var(--border); font-style: italic; }
</style>
