<script lang="ts">
  /**
   * Zauberwirken: Klasse/Attribut mit reaktivem SG und Angriffsbonus, Slots je Grad,
   * Zaubertricks und Zauberliste — jeweils mit Bibliotheks-Link, Tooltip und Sprung.
   * Die eigentliche Auswahl läuft über den geteilten `SpellPickModal` (Wizard/Level-Up);
   * Freitext bleibt als Notausgang für Homebrew und unverlinkten Altbestand.
   */
  import { activeFile } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { sign } from '../../utils/num';
  import { matchSpell, resolveClass, SCHOOL_COLORS, type SpellIndex, type SpellInfo } from '../../spellLibrary';
  import { linkByName } from '../../services/library/nameIndex';
  import { CLASS_NAMES_DE } from '../../services/classProgression';
  import { CASTER_ABILITY_DE, spellcastingOffer, type SpellcastingOffer } from '../../services/spellcasting';
  import {
    cantripPicks, cantripQuota, casterRowOf, levelPickScope,
    mergeCantripPicks, mergeSpellPicks, spellQuota,
  } from '../../services/characterSpellPicks';
  import {
    computedSpellAttack, computedSpellSaveDC, spellAbilityMod, spellAutoActive, withCurrentSorted,
    type CharacterFormFields,
  } from '../../services/characterFormFields';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import { createSpellHover } from '../spellHover.svelte';
  import SpellTooltip from '../SpellTooltip.svelte';
  import SpellPickModal from '../SpellPickModal.svelte';
  import SpellCreateModal from '../SpellCreateModal.svelte';
  import SpellFreeTextRow from './SpellFreeTextRow.svelte';
  import type { Character, SpellRef } from '../../schemas/characterSchema';
  import './form.css';

  const LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  let { form, spellLibrary, spellIndex, saved, fixLabel, onfix, dirOf, onlibraryreload }: {
    form: CharacterFormFields;
    spellLibrary: SpellInfo[];
    spellIndex: SpellIndex;
    saved?: Character | null;
    fixLabel?: string;
    onfix: () => void;
    dirOf: (old: unknown, now: unknown) => DiffDir;
    onlibraryreload: () => Promise<void> | void;
  } = $props();

  const spells = $derived(form.spells);
  const abilityMod = $derived(spellAbilityMod(form));
  const autoActive = $derived(spellAutoActive(form));
  const autoSaveDC = $derived(computedSpellSaveDC(form));
  const autoAttack = $derived(computedSpellAttack(form));

  const classOptions = $derived(withCurrentSorted(CLASS_NAMES_DE, spells.spellcastingClass));
  const abilityOptions = $derived(withCurrentSorted(Object.values(CASTER_ABILITY_DE), spells.spellcastingAbility));

  const resolve = (ref: SpellRef): SpellInfo | undefined => matchSpell(spellIndex, ref);
  const spellColor = (ref: SpellRef): string => {
    const school = resolve(ref)?.school;
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  };

  /** Nur über den KEY verglichen — ein Name-Treffer wäre trivial gleich. */
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

  // Kontingent aus der Klassentabelle — nur Orientierung: der Editor kennt keine
  // Merkmals-Extras (`riderExtras` gehört zum Stufenaufstieg), darum blockt der Dialog hier
  // nicht (`enforceMax={false}`), anders als in Wizard und Level-Up.
  const casterRow = $derived(casterRowOf({ classes: form.classes, spellcastingClass: spells.spellcastingClass }, resolveClass));
  let offer = $state<SpellcastingOffer | null>(null);
  $effect(() => {
    const row = casterRow;
    if (!row) { offer = null; return; }
    let cancelled = false;
    void spellcastingOffer({ classKey: row.classKey, klasseName: row.klasseName, level: row.level })
      .then((o) => { if (!cancelled) offer = o; })
      .catch(() => { if (!cancelled) offer = null; });
    return () => { cancelled = true; };
  });

  const cantripMax = $derived(cantripQuota(offer));
  const spellMax = $derived(spellQuota(offer));
  // Ohne (aufgelöste) Zauberklasse bleibt Grad 1–9 offen — sonst verschwände ein Alt-Eintrag
  // eines nicht verlinkten Charakters stumm aus dem Dialog.
  const scope = $derived(levelPickScope(spells.byLevel, offer?.isCaster ? offer.maxSpellLevel : 9));
  const pickClass = $derived(offer?.spellClass || spells.spellcastingClass);
  const quotaHint = $derived(
    casterRow
      ? `Orientierung nach Klassentabelle (${casterRow.klasseName}, Stufe ${casterRow.level}). Von Merkmalen gewährte Zauber zählen hier mit — der Editor begrenzt nicht.`
      : 'Kontingent unbekannt — die Klasse ist nicht mit der Bibliothek verknüpft.',
  );
  // Nur eindeutige Namen verlinken — ein falscher Key wäre schlimmer als keiner.
  const resolveKey = (name: string): string | undefined => linkByName(spellIndex, name).sourceKey;

  let picking = $state<'cantrips' | 'spells' | null>(null);
  let creating = $state<{ name: string; levels: number[] } | null>(null);

  function applyCantripPicks(v: string[]) {
    spells.cantrips = mergeCantripPicks(spells.cantrips, v, resolveKey);
  }
  function applyLevelPicks(v: string[]) {
    spells.byLevel = mergeSpellPicks(spells.byLevel, v, { levels: scope.levels, regime: offer?.regime ?? 'fixed-list', resolveKey });
  }

  function addFreeText(e: { name: string; sourceKey?: string; level: number; prepared: boolean }) {
    const ref = { name: e.name, ...(e.sourceKey ? { sourceKey: e.sourceKey } : {}) };
    if (e.level <= 0) {
      if (!spells.cantrips.some((c) => c.name === e.name)) spells.cantrips = [...spells.cantrips, ref];
      return;
    }
    const lvl = String(e.level);
    const existing = spells.byLevel[lvl] ?? [];
    if (!existing.some((s) => s.name === e.name)) spells.byLevel[lvl] = [...existing, { ...ref, prepared: e.prepared }];
  }

  async function onSpellCreated(canonical: string, level: number) {
    creating = null;
    await onlibraryreload(); // sonst löst der neue Zauber im Formular nicht auf
    addFreeText({ name: canonical, sourceKey: resolveKey(canonical), level, prepared: offer?.regime !== 'spellbook' });
  }

  // Modulweit geteilter Hover-Cache (wie im Wizard/Level-Up); `resolve` löst hier zusätzlich
  // über `sourceKey`, EN-Namen und Ambiguität auf, ein reines `library.map(s => [s.name, s])`
  // fände den Tooltip für ≠-abweichende oder englisch benannte Einträge nicht.
  const hoverIndex = $derived.by(() => {
    const idx = new Map<string, SpellInfo>();
    for (const ref of [...spells.cantrips, ...Object.values(spells.byLevel).flat()]) {
      const info = resolve(ref);
      if (info) idx.set(ref.name, info);
    }
    return idx;
  });
  const hover = createSpellHover(() => hoverIndex, () => hoverIndex.keys());
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
      onmouseenter={(e) => hover.show(e, c.name)}
      onmousemove={hover.move}
      onmouseleave={hover.hide}>{c.name}</span>{#if divergedName(c)}<span class="name-diverged" title="Bibliothek: {divergedName(c)}">≠</span>{/if}<button onclick={() => { spells.cantrips = spells.cantrips.filter((x) => x !== c); }}>✕</button></span>
  {/each}
</div>
<div class="spell-pick-row">
  <button type="button" class="btn-pick" disabled={!spellLibrary.length} onclick={() => (picking = 'cantrips')}>
    📖 Aus der Bibliothek wählen
  </button>
  <span class="spell-quota" class:over={cantripMax > 0 && spells.cantrips.length > cantripMax} title={quotaHint}>
    {spells.cantrips.length}{#if cantripMax > 0} / {cantripMax}{/if} Zaubertricks
  </span>
</div>

<h3 style="margin-top:0.75rem">Zauber</h3>
<div class="spell-pick-row">
  <button type="button" class="btn-pick" disabled={!spellLibrary.length} onclick={() => (picking = 'spells')}>
    📖 Aus der Bibliothek wählen
  </button>
  <span class="spell-quota" class:over={spellMax > 0 && scope.picks.length > spellMax} title={quotaHint}>
    {scope.picks.length}{#if spellMax > 0} / {spellMax}{/if} Zauber{#if offer?.isCaster}, bis Grad {offer.maxSpellLevel}{/if}
  </span>
</div>

<details class="spell-freetext">
  <summary>Freitext: Homebrew &amp; Altbestand</summary>
  <SpellFreeTextRow library={spellLibrary} spellClass={pickClass} level={0} placeholder="Zaubertrick…" onadd={addFreeText} />
  <SpellFreeTextRow library={spellLibrary} spellClass={pickClass} level={null} placeholder="Zauber-Name…" onadd={addFreeText} />
</details>

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
            onmouseenter={(e) => hover.show(e, spell.name)}
            onmousemove={hover.move}
            onmouseleave={hover.hide}>{spell.name}</span>
          {#if divergedName(spell)}<span class="name-diverged" title="Bibliothek: {divergedName(spell)}">≠</span>{/if}
          <button class="remove-btn" onclick={() => { spells.byLevel[lvl] = levelSpells.filter((_, j) => j !== i); }}>✕</button>
        </div>
      {/each}
    </div>
  {/if}
{/each}

{#if picking === 'cantrips'}
  <SpellPickModal title="Zaubertricks" library={spellLibrary} spellLevels={[0]} spellClass={pickClass}
    max={cantripMax} enforceMax={false} allowCreate onCreate={(q, lv) => (creating = { name: q.trim(), levels: lv })}
    bind:picks={() => cantripPicks(spells.cantrips), applyCantripPicks}
    onclose={() => (picking = null)} />
{:else if picking === 'spells'}
  <SpellPickModal title={offer?.regime === 'spellbook' ? 'Zauberbuch' : 'Zauber'} library={spellLibrary}
    spellLevels={scope.levels} spellClass={pickClass} max={spellMax} enforceMax={false}
    allowCreate onCreate={(q, lv) => (creating = { name: q.trim(), levels: lv })}
    bind:picks={() => scope.picks, applyLevelPicks}
    onclose={() => (picking = null)} />
{/if}

{#if creating}
  <SpellCreateModal name={creating.name} levels={creating.levels}
    onclose={() => (creating = null)} oncreated={onSpellCreated} />
{/if}

<SpellTooltip spell={hover.spell} x={hover.x} y={hover.y} />
