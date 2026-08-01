<script lang="ts">
  /**
   * Zauberwirken: Klasse/Attribut mit reaktivem SG und Angriffsbonus, Slots je Grad,
   * Zaubertricks und Zauberliste — jeweils mit Bibliotheks-Link, Tooltip und Sprung.
   */
  import { activeFile } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { sign } from '../../utils/num';
  import {
    searchSpells, loadSpellByPath, matchSpell, SCHOOL_COLORS,
    type SpellIndex, type SpellInfo, type SpellSuggestion,
  } from '../../spellLibrary';
  import { CLASS_NAMES_DE } from '../../services/classProgression';
  import { CASTER_ABILITY_DE } from '../../services/spellcasting';
  import {
    computedSpellAttack, computedSpellSaveDC, spellAbilityMod, spellAutoActive, withCurrent,
    type CharacterFormFields,
  } from '../../services/characterFormFields';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import SpellTooltip from '../SpellTooltip.svelte';
  import type { Character, SpellRef } from '../../schemas/characterSchema';
  import type { Spell } from '../../types';
  import './form.css';

  const LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  let { form, spellLibrary, spellIndex, saved, fixLabel, onfix, dirOf }: {
    form: CharacterFormFields;
    spellLibrary: SpellInfo[];
    spellIndex: SpellIndex;
    saved?: Character | null;
    /** Text des Altformat-Angebots; fehlt es, gibt es nichts nachzuverlinken. */
    fixLabel?: string;
    onfix: () => void;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  const spells = $derived(form.spells);
  const abilityMod = $derived(spellAbilityMod(form));
  const autoActive = $derived(spellAutoActive(form));
  const autoSaveDC = $derived(computedSpellSaveDC(form));
  const autoAttack = $derived(computedSpellAttack(form));

  const classOptions = $derived(withCurrent(CLASS_NAMES_DE, spells.spellcastingClass));
  const abilityOptions = $derived(withCurrent(Object.values(CASTER_ABILITY_DE), spells.spellcastingAbility));

  const resolve = (ref: SpellRef): SpellInfo | undefined => matchSpell(spellIndex, ref);
  const spellColor = (ref: SpellRef): string => {
    const school = resolve(ref)?.school;
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  };

  /**
   * Der Bibliotheksname zu einem gelinkten Zauber, wenn er vom gespeicherten `name`
   * abweicht (nur über den KEY verglichen — der Fallback-Name-Treffer wäre trivial gleich).
   */
  function divergedName(ref: SpellRef): string | undefined {
    const key = ref.sourceKey?.trim();
    if (!key) return undefined;
    const canonical = spellIndex.byKey.get(key)?.name;
    return canonical && canonical.trim() !== ref.name.trim() ? canonical : undefined;
  }

  const divergedCount = $derived.by(() => {
    let n = spells.cantrips.filter((c) => divergedName(c)).length;
    for (const arr of Object.values(spells.byLevel)) n += arr.filter((e) => divergedName(e)).length;
    return n;
  });

  function syncNames() {
    const fix = (ref: SpellRef) => {
      const canonical = divergedName(ref);
      if (canonical) ref.name = canonical;
    };
    spells.cantrips.forEach(fix);
    spells.cantrips = [...spells.cantrips];
    for (const lvl of Object.keys(spells.byLevel)) {
      spells.byLevel[lvl].forEach(fix);
      spells.byLevel[lvl] = [...spells.byLevel[lvl]];
    }
  }

  async function openSpellPage(ref: SpellRef) {
    const info = resolve(ref);
    if (!info?.path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = info.path.split('/').pop()?.replace('.json', '') ?? ref.name;
    activeFile.set({ name, path: info.path, type: 'spell' });
  }

  let cantripInput = $state('');
  let cantripSuggestions = $state<SpellSuggestion[]>([]);
  let cantripSugIndex = $state(-1);
  let spellInput = $state('');
  let spellInputLvl = $state('1');
  let spellInputPrepared = $state(false);
  let spellSuggestions = $state<SpellSuggestion[]>([]);
  let spellSugIndex = $state(-1);

  $effect(() => {
    cantripSuggestions = cantripInput.length > 0
      ? searchSpells(spellLibrary, cantripInput, 0, spells.spellcastingClass)
      : [];
    cantripSugIndex = -1;
  });

  $effect(() => {
    spellSuggestions = spellInput.length > 0
      ? searchSpells(spellLibrary, spellInput, Number(spellInputLvl), spells.spellcastingClass)
      : [];
    spellSugIndex = -1;
  });

  // Aus der Autocomplete gewählt → Key gleich am SpellInfo abgreifen (wie beim Inventar).
  function selectCantrip(sug: SpellSuggestion) {
    if (!spells.cantrips.some((c) => c.name === sug.spell.name))
      spells.cantrips.push({ name: sug.spell.name, ...(sug.spell.key ? { sourceKey: sug.spell.key } : {}) });
    cantripInput = '';
    cantripSuggestions = [];
  }

  function addCantrip() {
    const v = cantripInput.trim();
    // Frei getippt → ohne Key; matchSpell löst später über den Namen auf.
    if (v && !spells.cantrips.some((c) => c.name === v)) spells.cantrips.push({ name: v });
    cantripInput = '';
    cantripSuggestions = [];
  }

  function selectSpell(sug: SpellSuggestion) {
    const existing = spells.byLevel[spellInputLvl] ?? [];
    spells.byLevel[spellInputLvl] = [
      ...existing,
      { name: sug.spell.name, prepared: spellInputPrepared, ...(sug.spell.key ? { sourceKey: sug.spell.key } : {}) },
    ];
    spellInput = '';
    spellInputPrepared = false;
    spellSuggestions = [];
  }

  function addSpell() {
    const v = spellInput.trim();
    if (!v) return;
    const existing = spells.byLevel[spellInputLvl] ?? [];
    spells.byLevel[spellInputLvl] = [...existing, { name: v, prepared: spellInputPrepared }];
    spellInput = '';
    spellInputPrepared = false;
    spellSuggestions = [];
  }

  function onCantripKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cantripSugIndex = Math.min(cantripSugIndex + 1, cantripSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cantripSugIndex = Math.max(cantripSugIndex - 1, -1); }
    else if (e.key === 'Escape') { cantripSuggestions = []; }
    else if (e.key === 'Enter') {
      if (cantripSugIndex >= 0 && cantripSuggestions[cantripSugIndex]) selectCantrip(cantripSuggestions[cantripSugIndex]);
      else addCantrip();
    }
  }

  function onSpellKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); spellSugIndex = Math.min(spellSugIndex + 1, spellSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spellSugIndex = Math.max(spellSugIndex - 1, -1); }
    else if (e.key === 'Escape') { spellSuggestions = []; }
    else if (e.key === 'Enter') {
      if (spellSugIndex >= 0 && spellSuggestions[spellSugIndex]) selectSpell(spellSuggestions[spellSugIndex]);
      else addSpell();
    }
  }

  // Alle eingetragenen Zauber vorab laden → sofortiger Tooltip beim Hover.
  let dataCache = $state(new Map<string, Spell | null>());
  let tooltip = $state<Spell | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  $effect(() => {
    for (const ref of [...spells.cantrips, ...Object.values(spells.byLevel).flat()]) {
      const name = ref.name;
      if (dataCache.has(name)) continue;
      const info = resolve(ref);
      if (!info?.path) continue;
      dataCache.set(name, null);
      dataCache = new Map(dataCache);
      loadSpellByPath(info.path).then((data) => {
        dataCache.set(name, data);
        dataCache = new Map(dataCache);
      });
    }
  });

  function showTooltip(e: MouseEvent, name: string) {
    const data = dataCache.get(name);
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

<div class="grid-3">
  <label use:diffMark={dirOf(saved?.spells?.spellcastingClass, spells.spellcastingClass)}>Zauberklasse
    <select bind:value={spells.spellcastingClass}>
      <option value="">—</option>
      {#each classOptions as c}<option value={c}>{c}</option>{/each}
    </select>
  </label>
  <label use:diffMark={dirOf(saved?.spells?.spellcastingAbility, spells.spellcastingAbility)}>Fähigkeit
    <select bind:value={spells.spellcastingAbility}>
      <option value="">—</option>
      {#each abilityOptions as a}<option value={a}>{a}</option>{/each}
    </select>
  </label>
  {#if autoActive}
    <label title="8 + Übungsbonus + Zauberattribut-Mod">Zauber-SG
      <span class="computed-cell computed-block">{autoSaveDC}</span>
    </label>
    <label title="Übungsbonus + Zauberattribut-Mod">Angriffsbonus
      <span class="computed-cell computed-block">{sign(autoAttack ?? 0)}</span>
    </label>
  {:else}
    <label use:diffMark={dirOf(saved?.spells?.saveDC, spells.saveDC)}>Zauber-SG<input type="number" min="0" bind:value={spells.saveDC} /></label>
    <label use:diffMark={dirOf(saved?.spells?.attackBonus, spells.attackBonus)}>Angriffsbonus<input type="number" bind:value={spells.attackBonus} /></label>
  {/if}
</div>
<label class="check-row spell-auto-toggle" use:diffMark={dirOf(saved?.spells?.autoCalc, spells.autoCalc)}>
  <input type="checkbox" bind:checked={spells.autoCalc} />
  <span>Zauber-SG &amp; Angriffsbonus automatisch berechnen</span>
</label>
{#if spells.autoCalc && abilityMod === null}
  <p class="auto-hint">Zauberattribut nicht erkannt – wähle oben eines aus der Liste, damit die Berechnung greift.</p>
{/if}

{#if fixLabel}
  <button class="btn-link-all" onclick={onfix}
    title="Setzt bei diesen Zaubern den Bibliotheks-Link (sourceKey). Wird beim Speichern übernommen.">
    🔗 {fixLabel}
  </button>
{/if}
{#if divergedCount > 0}
  <button class="btn-link-all" onclick={syncNames}
    title="Diese Zauber sind verlinkt, ihr Name weicht aber vom Bibliothekseintrag ab. Übernimmt den Bibliotheksnamen.">
    ✎ {divergedCount} Namen an die Bibliothek angleichen
  </button>
{/if}

<h3 style="margin-top:0.75rem">Slots je Stufe</h3>
<div class="slot-edit-row">
  {#each spells.slotTotals as _, i}
    <label class="slot-label" use:diffMark={dirOf(saved?.spells?.slots?.[i]?.total, spells.slotTotals[i])}>S{i + 1}<input type="number" min="0" max="9" bind:value={spells.slotTotals[i]} /></label>
  {/each}
</div>

<h3 style="margin-top:0.75rem">Zaubertricks</h3>
<div class="tag-editor">
  {#each spells.cantrips as c}
    <span class="tag" style="color:{spellColor(c) || 'inherit'}" use:diffMark={!saved ? 'none' : (saved.spells?.cantrips ?? []).some((s) => s.name === c.name) ? 'none' : 'up'}><span
      class="spell-link" class:linked={!!resolve(c)?.path}
      role="button" tabindex="0"
      onclick={() => openSpellPage(c)}
      onkeydown={(e) => e.key === 'Enter' && openSpellPage(c)}
      onmouseenter={(e) => showTooltip(e, c.name)}
      onmousemove={moveTooltip}
      onmouseleave={hideTooltip}>{c.name}</span>{#if divergedName(c)}<span class="name-diverged" title="Bibliothek: {divergedName(c)}">≠</span>{/if}<button onclick={() => { spells.cantrips = spells.cantrips.filter((x) => x !== c); }}>✕</button></span>
  {/each}
  <div class="autocomplete-wrap">
    <input class="tag-input" bind:value={cantripInput} placeholder="Zaubertrick…"
      onkeydown={onCantripKey}
      onblur={() => setTimeout(() => { cantripSuggestions = []; }, 150)} />
    {#if cantripSuggestions.length > 0}
      <ul class="suggestions">
        {#each cantripSuggestions as sug, i}
          <li class:active={i === cantripSugIndex} class:out-of-class={!sug.inClass}
            onmousedown={() => selectCantrip(sug)}>
            <span style={sug.inClass ? `color:${SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}` : ''}>{sug.spell.name}</span>
            {#if !sug.inClass}<span class="sug-hint">nicht in Klasse</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <button class="btn-add-sm" onclick={addCantrip}>+</button>
</div>

<h3 style="margin-top:0.75rem">Zauber hinzufügen</h3>
<div class="spell-add-row">
  <select bind:value={spellInputLvl} class="spell-level-select">
    {#each LEVELS as lvl}
      <option value={lvl}>Stufe {lvl}</option>
    {/each}
  </select>
  <div class="autocomplete-wrap spell-autocomplete">
    <input class="spell-name-input" bind:value={spellInput} placeholder="Zauber-Name…"
      onkeydown={onSpellKey}
      onblur={() => setTimeout(() => { spellSuggestions = []; }, 150)} />
    {#if spellSuggestions.length > 0}
      <ul class="suggestions">
        {#each spellSuggestions as sug, i}
          <li class:active={i === spellSugIndex} class:out-of-class={!sug.inClass}
            onmousedown={() => selectSpell(sug)}>
            <span style={sug.inClass ? `color:${SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}` : ''}>{sug.spell.name}</span>
            {#if !sug.inClass}<span class="sug-hint">nicht in Klasse</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <label class="prep-check"><input type="checkbox" bind:checked={spellInputPrepared} /> Vorb.</label>
  <button class="btn-add-sm" onclick={addSpell}>+</button>
</div>

{#each LEVELS as lvl}
  {@const levelSpells = spells.byLevel[lvl] ?? []}
  {#if levelSpells.length || spells.slotTotals[Number(lvl) - 1] > 0}
    <div class="spell-level-block">
      <span class="spell-level-label">Stufe {lvl} ({spells.slotTotals[Number(lvl) - 1]} Slots)</span>
      {#each levelSpells as spell, i}
        {@const savedSpell = saved?.spells?.byLevel?.[lvl]?.find((s) => s.name === spell.name)}
        {@const spellDir = !saved ? 'none' : !savedSpell ? 'up' : savedSpell.prepared !== spell.prepared ? 'up' : 'none'}
        <div class="spell-edit-row" use:diffMark={spellDir}>
          <button class="prep-toggle" title={spell.prepared ? 'Vorbereitet' : 'Nicht vorbereitet'}
            onclick={() => { levelSpells[i] = { ...spell, prepared: !spell.prepared }; spells.byLevel[lvl] = [...levelSpells]; }}>
            {spell.prepared ? '●' : '○'}
          </button>
          <span class="spell-item-name" class:prepared={spell.prepared}
            class:linked={!!resolve(spell)?.path}
            style="color:{spellColor(spell) || 'inherit'}"
            role="button" tabindex="0"
            onclick={() => openSpellPage(spell)}
            onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell)}
            onmouseenter={(e) => showTooltip(e, spell.name)}
            onmousemove={moveTooltip}
            onmouseleave={hideTooltip}>{spell.name}</span>
          {#if divergedName(spell)}<span class="name-diverged" title="Bibliothek: {divergedName(spell)}">≠</span>{/if}
          <button class="remove-btn" onclick={() => { spells.byLevel[lvl] = levelSpells.filter((_, j) => j !== i); }}>✕</button>
        </div>
      {/each}
    </div>
  {/if}
{/each}

<SpellTooltip spell={tooltip} x={tooltipX} y={tooltipY} />
