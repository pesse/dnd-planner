<script lang="ts">
  /**
   * Der Talent-Abschnitt der Merkmalsleiste: Bibliotheks-Links, ihr Picker und die Wahlen am
   * Talent. Geschrieben wird nur über das Ledger des Panels.
   */
  import type { Character } from '$lib/schemas/characterSchema';
  import type { Change } from '$lib/schemas/levelUp';
  import { activeFile } from '$lib/stores/campaign';
  import { confirmNavigation } from '$lib/stores/navigationGuard';
  import {
    getFeats, searchFeats, featDisplayName, featDesc, featPrereq, matchFeatEntry,
    FEAT_CATEGORY_DE, type FeatEntry,
  } from '$lib/featsLibrary';
  import { blankFeat, featDraftName, searchOpen5eFeats, loadOpen5eFeat, searchFeatLibrary } from '$lib/services/featCreate';
  import type { FeatureLedger, LedgerRow } from '$lib/services/featureLedger';
  import { diffMark, type DiffDir } from '$lib/utils/diffHighlight';
  import { createSuggestNav } from '$lib/utils/suggestNav.svelte';
  import { dropdownPlacement } from '$lib/utils/dropdownPlacement';
  import { createHoverTip } from '$lib/utils/hoverTip.svelte';
  import CreateCardModal from '../CreateCardModal.svelte';
  import FeatTooltip from '../FeatTooltip.svelte';
  import Markdown from '../Markdown.svelte';
  import ChoiceSection from './ChoiceSection.svelte';
  import LooseChoice from './LooseChoice.svelte';
  import type { ChoiceState } from './choiceState.svelte';
  import './featurePanel.css';

  let { rows, ledger, choices, saved = null, onapply }: {
    rows: LedgerRow[];
    ledger: FeatureLedger;
    choices: ChoiceState;
    /** Baseline des Diff-Highlightings. */
    saved?: Character | null;
    onapply: (changes: Change[]) => void;
  } = $props();

  let featsLibrary = $state<FeatEntry[]>([]);
  // Vor dem ersten Laden sieht JEDER Link unverlinkt aus → „⚠"-Zeilen erst danach zeigen.
  let featsLoaded = $state(false);
  $effect(() => { getFeats().then((x) => { featsLibrary = x; featsLoaded = true; }); });

  let featPickerTarget = $state<'add' | number | null>(null);
  let featQuery = $state('');
  let showFeatCreate = $state(false);

  const featOptions = $derived.by(() => {
    const taken = new Set(
      rows
        .map(({ e }) => matchFeatEntry(featsLibrary, { sourceKey: e.sourceKey, name: e.name })?.path)
        .filter((p): p is string => !!p),
    );
    const pool = featsLibrary.filter((f) => !f.path || !taken.has(f.path));
    return featQuery.trim() ? searchFeats(pool, featQuery, 8) : pool;
  });

  function openFeatPicker(target: 'add' | number) {
    featPickerTarget = target;
    featQuery = '';
    featNav.reset();
  }
  function closeFeatPicker() {
    featPickerTarget = null;
    featQuery = '';
    featNav.reset();
    featTip.hide(); // Vorschlag verschwindet aus dem DOM → kein mouseleave mehr
  }

  const featTip = createHoverTip<FeatEntry>();

  function pickFeat(target: 'add' | number, f: FeatEntry) {
    const link = { sourceKey: f.sourceKey ?? '', name: featDisplayName(f) };
    if (target === 'add') ledger.append({ ...link, choice: '', choiceDe: '', desc: '' });
    // `desc: ''` — die Legacy-Freitext-Beschreibung weicht der Bibliothek.
    else ledger.update(target, { ...link, desc: '' });
    closeFeatPicker();
  }

  // Ohne `enter`: freier Text darf kein Talent anlegen.
  const featNav = createSuggestNav<FeatEntry>({
    items: () => featOptions,
    pick: (opt) => { if (featPickerTarget !== null) pickFeat(featPickerTarget, opt); },
    escape: closeFeatPicker,
  });

  function onFeatPickerKey(e: KeyboardEvent, target: 'add' | number) {
    if (featPickerTarget !== target) return;
    featNav.onkeydown(e);
  }

  const savedFeatLinks = $derived((saved?.features ?? []).filter((r) => !r.choice?.trim()));

  /**
   * Baseline über Link (Fallback: Name) und Stufe, NICHT über den Index: dasselbe Talent
   * darf mehrfach vergeben sein, und die gespeicherte Liste kann verschoben sein.
   */
  function featDir(ref: { sourceKey?: string; name: string; gainedAt?: number }): DiffDir {
    if (!saved || !ref.name.trim()) return 'none';
    const key = (ref.sourceKey ?? '').trim();
    const unchanged = savedFeatLinks.some(
      (s) =>
        (key ? (s.sourceKey ?? '').trim() === key : !(s.sourceKey ?? '').trim()) &&
        s.name === ref.name &&
        (s.gainedAt ?? null) === (ref.gainedAt ?? null),
    );
    return unchanged ? 'none' : 'up';
  }

  /** Verlässt den Charakter, deshalb der Guard. */
  async function openFeatPage(entry: FeatEntry) {
    if (!entry.path) return;
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: entry.path.split('/').pop()!.replace('.json', ''), path: entry.path, type: 'feat' });
  }

  /** Der Dialog öffnet den Entwurf im Editor, verlässt also den Charakter — Guard davor. */
  async function createFeatCard() {
    if (!(await confirmNavigation())) return;
    closeFeatPicker();
    showFeatCreate = true;
  }
</script>

<!-- Einmal zum Hinzufügen, einmal je Altdaten-Zeile zum Ersetzen — daher der Ziel-Parameter. -->
{#snippet featPicker(target: 'add' | number, placeholder: string)}
  <div class="autocomplete-wrap feat-picker">
    <input
      value={featPickerTarget === target ? featQuery : ''}
      {placeholder}
      onfocus={() => openFeatPicker(target)}
      oninput={(e) => { featPickerTarget = target; featQuery = (e.currentTarget as HTMLInputElement).value; featNav.reset(); }}
      onkeydown={(e) => onFeatPickerKey(e, target)}
      onblur={() => setTimeout(() => { if (featPickerTarget === target) closeFeatPicker(); }, 150)}
    />
    {#if featPickerTarget === target}
      <ul class="suggestions compact" use:dropdownPlacement>
        {#each featOptions as opt, si}
          <li class:active={si === featNav.index} onmousedown={() => pickFeat(target, opt)}
            onmouseenter={(e) => featTip.show(e, opt)}
            onmousemove={featTip.move}
            onmouseleave={featTip.hide}>
            <span>{featDisplayName(opt)}</span>
            {#if opt.category}<span class="sug-cat">{FEAT_CATEGORY_DE[opt.category]}</span>{/if}
          </li>
        {/each}
        {#if !featOptions.length}
          <li class="sug-empty">Kein Treffer in der Bibliothek — mit „+ Neues Talent" anlegen.</li>
        {/if}
      </ul>
    {/if}
  </div>
{/snippet}

{#if rows.length}
  <ul class="fp-list">
    {#each rows as { e, i } (i)}
      {@const entry = matchFeatEntry(featsLibrary, { sourceKey: e.sourceKey, name: e.name })}
      {@const slots = choices.slotsOf(entry?.sourceKey || e.sourceKey)}
      <li class="feat-row" use:diffMark={featDir(e)}>
        <div class="fp-head">
          {#if entry}
            <button type="button" class="fp-name fp-name-link" title="Talent-Karte öffnen" onclick={() => openFeatPage(entry)}>{featDisplayName(entry)}</button>
            {#if entry.category}<span class="fp-choice">{FEAT_CATEGORY_DE[entry.category]}</span>{/if}
          {:else if featPickerTarget === i}
            {@render featPicker(i, 'Talent aus der Bibliothek…')}
          {:else if !featsLoaded}
            <span class="fp-name feat-loading">{e.name}</span>
          {:else}
            <!-- Altdaten ohne Bibliotheks-Quelle: nicht wegfiltern, sonst zeigte die
                 Leiste weniger als die Datei. -->
            <span class="fp-name ref-unlinked" title="Kein Talent dieses Namens in der Bibliothek">⚠ {e.name.trim() || '(ohne Namen)'}</span>
            <button type="button" class="link-edit" title="Aus der Bibliothek wählen" onclick={() => openFeatPicker(i)}>✎</button>
          {/if}
          {#if !slots.length}<LooseChoice rows={choices.looseOf(e.sourceKey)} {ledger} />{/if}
          <span class="feat-row-actions">
            <label class="feat-lvl" title="Charakterstufe, auf der das Talent erworben wurde (nur Herkunftsangabe, ohne Regelwirkung)">Stufe
              <input class="ref-level" type="number" min="1" max="20" value={e.gainedAt ?? ''}
                oninput={(ev) => { const v = parseInt((ev.target as HTMLInputElement).value); ledger.update(i, { gainedAt: Number.isNaN(v) ? undefined : v }); }} />
            </label>
            <button class="remove-btn" title="Talent entfernen" onclick={() => ledger.remove(i)}>✕</button>
          </span>
        </div>
        {#if entry}
          {@const prereq = featPrereq(entry)}
          {@const desc = featDesc(entry)}
          {#if prereq}<div class="fp-prereq">Voraussetzung: {prereq}</div>{/if}
          {#if desc}<div class="fp-desc"><Markdown source={desc} /></div>{/if}
          <ChoiceSection {slots} facts={choices.factsOf(entry.sourceKey || e.sourceKey)} {choices} {ledger} {onapply} />
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="fp-empty">Noch keine Talente verlinkt.</p>
{/if}
<div class="feat-add-row">
  {@render featPicker('add', 'Talent hinzufügen — Bibliothek durchsuchen…')}
  <button type="button" class="btn-add" title="Talent-Karte in der Bibliothek anlegen (öffnet den Talent-Editor)" onclick={createFeatCard}>+ Neues Talent</button>
</div>

<FeatTooltip feat={featTip.data} x={featTip.x} y={featTip.y} />

{#if showFeatCreate}
  <CreateCardModal
    type="feat"
    title="Neues Talent"
    searchApi={searchOpen5eFeats}
    loadApi={loadOpen5eFeat}
    searchLibrary={searchFeatLibrary}
    blank={blankFeat}
    nameOf={featDraftName}
    onclose={() => (showFeatCreate = false)}
  />
{/if}

<style>
  /* Nicht global unter `.fpanel`: das träfe auch die Felder des Anlege-Dialogs. */
  input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font-size: 0.82rem;
    outline: none;
    font-family: inherit;
  }
  input:focus { border-color: var(--arcane); }
</style>
