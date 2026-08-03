<script lang="ts">
  /**
   * Die Merkmals-Seitenleiste: Klassen-, Volks- und Hintergrundmerkmale, Talent-Links und
   * deklarierte Wahlen. Besitzt `character.features` — jede Bedienung schreibt die ganze
   * Liste zurück (`writeLedger`), und genau das ist das Dirty-Signal der Save-Bar.
   */
  import { untrack, type Snippet } from 'svelte';
  import type { Character, CharacterFeatureEntry } from '$lib/schemas/characterSchema';
  import type { Change } from '$lib/schemas/levelUp';
  import { activeFile } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import {
    getFeats, searchFeats, featDisplayName, featDesc, featPrereq, matchFeatEntry,
    FEAT_CATEGORY_DE, type FeatEntry,
  } from '../featsLibrary';
  import { blankFeat, featDraftName, searchOpen5eFeats, loadOpen5eFeat, searchFeatLibrary } from '../services/featCreate';
  import {
    choiceDisplay, keysOf, resolveBackground, resolveClassFeatures, resolveSpeciesTraits,
    type ResolvedFeatureGroup,
  } from '../services/characterFeatures';
  import {
    buildCharacterChoices, choiceGrantChanges, choiceHint, collectChoiceSlots, openChoiceBadge,
    sheetSkillProficiencies, withChoiceAnswer, type CharacterChoice, type ChoiceSlot,
  } from '../services/characterChoices';
  import { changesWouldAlter, type ApplyContext } from '../services/applyChanges';
  import { getSpellLibrary, buildSpellIndex, matchSpell, type SpellInfo } from '../spellLibrary';
  import type { CoverageBadge } from '../services/declarationCoverage';
  import { classifyChange, diffMark, type DiffDir } from '../utils/diffHighlight';
  import { createSuggestNav } from '../utils/suggestNav.svelte';
  import { createHoverTip } from '../utils/hoverTip.svelte';
  import DeclarationBadge from './DeclarationBadge.svelte';
  import FeatureChoicePicker from './FeatureChoicePicker.svelte';
  import FeatTooltip from './FeatTooltip.svelte';
  import CreateCardModal from './CreateCardModal.svelte';
  import Markdown from './Markdown.svelte';

  let { character, saved = null, onApplyChanges, badge = $bindable(null), openCount = $bindable(0) }: {
    /** Der `ed.draft`-Proxy — wird IN PLACE mutiert (immutabel je Feld, siehe `writeLedger`). */
    character: Character;
    /** Baseline des Diff-Highlightings. */
    saved?: Character | null;
    /**
     * „Übernehmen" einer Wahl läuft über den Eltern-Editor, weil das Anwenden den DRAFT
     * per neuer Referenz ersetzt — die Leiste kann sich nicht selbst neu aufsetzen.
     */
    onApplyChanges?: (changes: Change[]) => void;
    /** Geht an die Lasche hinaus, damit der Stand auch ZUGEKLAPPT sichtbar bleibt. */
    badge?: CoverageBadge | null;
    openCount?: number;
  } = $props();

  const dirOf = (o: unknown, n: unknown): DiffDir => (saved ? classifyChange(o, n) : 'none');

  // ─── Ledger: genau ein Schreiber ───────────────────────────────────────────────
  // Immer die ganze Liste, immer an der VORHANDENEN Position: eine Umsortierung machte den
  // Charakter beim bloßen Öffnen dirty, denn die Leiste ist immer montiert.
  function writeLedger(next: CharacterFeatureEntry[]) {
    character.features = next;
  }
  function updateEntry(i: number, patch: Partial<CharacterFeatureEntry>) {
    writeLedger(character.features.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }
  function removeEntry(i: number) {
    writeLedger(character.features.filter((_, j) => j !== i));
  }

  /** Talent-Links mit ihrem ECHTEN Ledger-Index — `choice` ist der Diskriminator. */
  const featRows = $derived(
    character.features.map((e, i) => ({ e, i })).filter(({ e }) => !e.choice.trim()),
  );

  // ─── Merkmals-Auflösung aus der Bibliothek ─────────────────────────────────────
  // Abhängigkeit sind allein die LINKS, als Wertschlüssel: läse der Effekt
  // `character.features` direkt, löste jede beantwortete Wahl eine neue Auflösung aus.
  const linkKey = $derived(
    JSON.stringify([
      (character.classes ?? []).map((c) => [c.sourceKey, c.name, c.subclassKey, c.subclassName, c.level]),
      [character.species?.sourceKey, character.species?.subspeciesKey, character.species?.name],
      [character.backgroundRef?.sourceKey, character.backgroundRef?.name],
      featRows.map(({ e }) => [e.sourceKey, e.name, e.gainedAt]),
    ]),
  );

  let classGroups = $state<ResolvedFeatureGroup[]>([]);
  let speciesGroups = $state<ResolvedFeatureGroup[]>([]);
  let backgroundGroups = $state<ResolvedFeatureGroup[]>([]);
  let choiceSlots = $state<ChoiceSlot[]>([]);
  $effect(() => {
    void linkKey;
    const c = untrack(() => $state.snapshot(character)) as Character;
    let cancelled = false;
    void (async () => {
      const [cls, spec, bg, slots] = await Promise.all([
        resolveClassFeatures(c.classes ?? []),
        resolveSpeciesTraits(c.species),
        resolveBackground(c.backgroundRef),
        collectChoiceSlots(c),
      ]);
      if (cancelled) return;
      classGroups = cls;
      speciesGroups = spec ?? [];
      backgroundGroups = bg ? [bg] : [];
      choiceSlots = slots;
    })();
    return () => { cancelled = true; };
  });

  const knownKeys = $derived([
    ...keysOf([...classGroups, ...speciesGroups, ...backgroundGroups]),
    ...featRows.map(({ e }) => e.sourceKey).filter(Boolean),
  ]);

  // ─── Deklarierte Merkmalswahlen (services/characterChoices.ts) ─────────────────
  // Die Expertise-Optionen sind der LIVE-Übungsstand aus dem Draft, nicht aus dem Formular:
  // sonst bliebe die Wahl tot, solange das Bearbeiten-Formular nicht montiert ist.
  const characterChoices = $derived(
    buildCharacterChoices(choiceSlots, {
      proficient: sheetSkillProficiencies(character.skills).prof,
      ledger: character.features,
    }),
  );
  /** Zuordnung Merkmal → seine Wahl-Plätze; der Index zeigt in `choiceGrants`. */
  const choicesByFeature = $derived.by(() => {
    const map = new Map<string, { ch: CharacterChoice; i: number }[]>();
    characterChoices.forEach((ch, i) => {
      const key = ch.slot.feature.key ?? '';
      if (!key) return;
      map.set(key, [...(map.get(key) ?? []), { ch, i }]);
    });
    return map;
  });

  let spellLibrary = $state<SpellInfo[]>([]);
  $effect(() => { getSpellLibrary().then((lib) => { spellLibrary = lib; }); });
  const spellIndex = $derived(buildSpellIndex(spellLibrary));

  const choiceGrants = $derived.by(() => {
    // Erst mit geladener Zauberbibliothek: davor wäre JEDER Options-Zauber „nicht gefunden",
    // und der Picker meldete eine Lücke, die es nicht gibt.
    if (!spellLibrary.length) return [];
    const snap = $state.snapshot(character) as Character;
    const ctx: ApplyContext = { classIndex: 0, resolveSpellKey: (n) => matchSpell(spellIndex, { name: n })?.key };
    return characterChoices.map((ch) => {
      const g = choiceGrantChanges(ch, spellLibrary);
      return { ...g, wouldAlter: changesWouldAlter(snap, g.changes, ctx) };
    });
  });

  $effect(() => {
    badge = openChoiceBadge(characterChoices);
    openCount = characterChoices.filter((c) => c.open).length;
  });

  const savedChoiceEntries = $derived((saved?.features ?? []).filter((r) => !!r.choice?.trim()));
  function savedAnswerOf(ch: CharacterChoice): string {
    const key = ch.slot.feature.key ?? '';
    const hit =
      savedChoiceEntries.find((e) => e.sourceKey === key && e.gainedAt === ch.slot.gainedAt) ??
      // Altbestand trägt kein `gainedAt` — dieselbe Nachsicht wie `buildCharacterChoices`.
      savedChoiceEntries.find((e) => e.sourceKey === key && e.gainedAt == null);
    return hit?.choice ?? '';
  }

  const claimed = $derived(new Set(characterChoices.map((c) => c.entry).filter((i) => i >= 0)));

  /**
   * Wahl-Einträge OHNE Platz (Merkmale ohne `grantsChoice`, KI-gedeutet). Je EINZELNER
   * Eintrag statt zusammengefasst: ein mehrfach vergebenes Merkmal hat mehrere, und jede
   * Zeile braucht ihren Ledger-Index zum Löschen.
   */
  const looseChoices = $derived.by(() => {
    const map = new Map<string, { e: CharacterFeatureEntry; i: number }[]>();
    character.features.forEach((e, i) => {
      if (!e.choice.trim() || claimed.has(i) || !e.sourceKey) return;
      map.set(e.sourceKey, [...(map.get(e.sourceKey) ?? []), { e, i }]);
    });
    return map;
  });

  // Verwaist = beides zugleich: kein Platz hat den Eintrag beansprucht UND der Key gehört zu
  // keinem Merkmal. Die erste Bedingung allein reicht nicht — eine Wahl an einem Merkmal
  // ohne `grantsChoice` hat nie einen Platz.
  const orphanRows = $derived.by(() => {
    const known = new Set(knownKeys);
    return character.features
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => !!e.choice.trim() && !claimed.has(i) && !known.has(e.sourceKey));
  });

  // ─── Talente: nur Bibliotheks-Links ────────────────────────────────────────────
  let featsLibrary = $state<FeatEntry[]>([]);
  // Vor dem ersten Laden sieht JEDER Link unverlinkt aus → „⚠"-Zeilen erst danach zeigen.
  let featsLoaded = $state(false);
  $effect(() => { getFeats().then((x) => { featsLibrary = x; featsLoaded = true; }); });

  let featPickerTarget = $state<'add' | number | null>(null);
  let featQuery = $state('');
  let showFeatCreate = $state(false);

  const featOptions = $derived.by(() => {
    const taken = new Set(
      featRows
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
    if (target === 'add')
      writeLedger([...character.features, { ...link, choice: '', choiceDe: '', desc: '' }]);
    // `desc: ''` — die Legacy-Freitext-Beschreibung weicht der Bibliothek.
    else updateEntry(target, { ...link, desc: '' });
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

  // ─── Zugeklappte Abschnitte ────────────────────────────────────────────────────
  // In `localStorage`, weil die Leiste beim Charakterwechsel neu montiert wird
  // ({#key dirPath}) — lokaler Zustand wäre jedes Mal weg.
  const COLLAPSE_KEY = 'char-features-blocks';
  let collapsed = $state<Record<string, boolean>>(readCollapsed());
  function readCollapsed(): Record<string, boolean> {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}');
      return raw && typeof raw === 'object' ? (raw as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }
  function setCollapsed(id: string, value: boolean) {
    if (collapsed[id] === value) return; // `ontoggle` feuert auch beim Setzen von außen
    collapsed = { ...collapsed, [id]: value };
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
  }

  /** Offene Wahlen unter diesen Keys — der Marker am zugeklappten Abschnitt. */
  function openIn(keys: Iterable<string>): number {
    const set = new Set(keys);
    return characterChoices.filter((c) => c.open && set.has(c.slot.feature.key ?? '')).length;
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

<!-- `i` zeigt in `choiceGrants` — beide Listen entstehen aus `characterChoices`, index-gleich. -->
{#snippet choiceRow(ch: CharacterChoice, i: number)}
  {@const g = choiceGrants[i]}
  {@const savedAnswer = savedAnswerOf(ch)}
  <!-- `showLevel`: die Stufe beschriftet nur, was sie unterscheidet — die Mehrfachvergabe. -->
  <FeatureChoicePicker
    choice={ch.choice}
    answer={ch.answer}
    open={ch.open}
    gainedAt={ch.slot.gainedAt}
    showLevel={(choicesByFeature.get(ch.slot.feature.key ?? '')?.length ?? 1) > 1}
    pendingGrants={!!g?.wouldAlter}
    hint={g ? choiceHint(ch, g, { wouldAlter: g.wouldAlter }) : ''}
    flagged={g?.flagged ?? []}
    diff={dirOf(savedAnswer, ch.answer.join(', '))}
    onchange={(next) => writeLedger(withChoiceAnswer(character.features, ch, next))}
    onapply={() => onApplyChanges?.(g?.changes ?? [])}
  />
{/snippet}

<!-- Antwort ohne Wahl-Platz: kein Picker, das Merkmal deklariert keine Optionen. -->
{#snippet looseChoice(key: string)}
  {#each looseChoices.get(key) ?? [] as l}
    <span class="fp-choice">Entscheidung: {choiceDisplay(l.e)}
      <button type="button" class="chip-x" onclick={() => removeEntry(l.i)}
        title="Entscheidung löschen — dieses Merkmal deklariert keine Optionen, eine neue Antwort kommt aus dem Stufenaufstieg">✕</button>
    </span>
  {/each}
{/snippet}

<!-- Was der Link liefert, ist read-only — bis auf die deklarierten Wahlen. -->
{#snippet featureGroups(groups: ResolvedFeatureGroup[], emptyHint: string)}
  {#if !groups.length}
    <p class="fp-empty">{emptyHint}</p>
  {:else}
    {#each groups as g}
      <div class="fp-group">
        <span class="fp-title">{g.title}</span>
        {#if g.unresolved}
          <span class="fp-unresolved">— nicht in der Bibliothek verlinkt</span>
        {:else if g.features.length}
          <ul class="fp-list">
            {#each g.features as f}
              {@const slots = choicesByFeature.get(f.key ?? '') ?? []}
              <li>
                <div class="fp-head">
                  <span class="fp-name">{f.name}</span>
                  {#if f.gainedAt}<span class="fp-lvl">Stufe {f.gainedAt}</span>{/if}
                  <!-- Mit Platz zeigt der Picker die Wahl; ein Chip daneben wäre die Dublette. -->
                  {#if !slots.length}{@render looseChoice(f.key ?? '')}{/if}
                </div>
                {#if f.desc}<div class="fp-desc"><Markdown source={f.desc} /></div>{/if}
                {#each slots as s}{@render choiceRow(s.ch, s.i)}{/each}
              </li>
            {/each}
          </ul>
        {:else}
          <span class="fp-unresolved">— keine</span>
        {/if}
      </div>
    {/each}
  {/if}
{/snippet}

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
      <ul class="suggestions compact">
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

{#snippet block(title: string, id: string, openChoices: number, body: Snippet)}
  <details class="ref-block" open={!collapsed[id]}
    ontoggle={(e) => setCollapsed(id, !e.currentTarget.open)}>
    <summary>
      <span class="rb-title">{title}</span>
      {#if openChoices}
        <span class="rb-open" title="{openChoices} unbeantwortete Wahl in diesem Abschnitt">{openChoices} offen</span>
      {/if}
    </summary>
    <div class="rb-body">{@render body()}</div>
  </details>
{/snippet}

{#snippet classBody()}{@render featureGroups(classGroups, 'Keine verlinkte Klasse — im Bearbeiten-Tab eine Klasse aus der Bibliothek wählen.')}{/snippet}
{#snippet speciesBody()}{@render featureGroups(speciesGroups, 'Kein verlinktes Volk — im Bearbeiten-Tab ein Volk aus der Bibliothek wählen.')}{/snippet}
{#snippet backgroundBody()}{@render featureGroups(backgroundGroups, 'Kein verlinkter Hintergrund — im Bearbeiten-Tab einen Hintergrund aus der Bibliothek wählen.')}{/snippet}

{#snippet featsBody()}
  {#if featRows.length}
    <ul class="fp-list">
      {#each featRows as { e, i } (i)}
        {@const entry = matchFeatEntry(featsLibrary, { sourceKey: e.sourceKey, name: e.name })}
        {@const slots = choicesByFeature.get(entry?.sourceKey || e.sourceKey) ?? []}
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
            {#if !slots.length}{@render looseChoice(e.sourceKey)}{/if}
            <span class="feat-row-actions">
              <label class="feat-lvl" title="Charakterstufe, auf der das Talent erworben wurde (nur Herkunftsangabe, ohne Regelwirkung)">Stufe
                <input class="ref-level" type="number" min="1" max="20" value={e.gainedAt ?? ''}
                  oninput={(ev) => { const v = parseInt((ev.target as HTMLInputElement).value); updateEntry(i, { gainedAt: Number.isNaN(v) ? undefined : v }); }} />
              </label>
              <button class="remove-btn" title="Talent entfernen" onclick={() => removeEntry(i)}>✕</button>
            </span>
          </div>
          {#if entry}
            {@const prereq = featPrereq(entry)}
            {@const desc = featDesc(entry)}
            {#if prereq}<div class="fp-prereq">Voraussetzung: {prereq}</div>{/if}
            {#if desc}<div class="fp-desc"><Markdown source={desc} /></div>{/if}
            {#each slots as s}{@render choiceRow(s.ch, s.i)}{/each}
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
{/snippet}

<div class="fpanel">
  <div class="fpanel-head">
    <span class="fpanel-title">Merkmale</span>
    {#if badge}<DeclarationBadge {badge} />{/if}
  </div>

  <div class="fpanel-body">
    <p class="fp-hint">
      Klassen-, Volks- &amp; Hintergrundmerkmale kommen aus der Bibliothek (read-only). Änderungen
      hier landen im Entwurf — gespeichert wird über die Speichern-Leiste.
    </p>

    {@render block('Klassenmerkmale', 'class', openIn(keysOf(classGroups)), classBody)}
    {@render block('Volksmerkmale', 'species', openIn(keysOf(speciesGroups)), speciesBody)}
    {@render block('Hintergrund', 'background', openIn(keysOf(backgroundGroups)), backgroundBody)}
    {@render block('Talente', 'feats', openIn(featRows.map(({ e }) => e.sourceKey)), featsBody)}

    {#if orphanRows.length}
      <!-- Bewusst kein <details>: ein Fehlerzustand sollte nicht wegklappbar sein. -->
      <div class="ref-block">
        <h4>Entscheidungen ohne zugeordnetes Merkmal</h4>
        <div class="rb-body">
          <p class="fp-empty">Verlinkung prüfen — das Merkmal steckt in keiner Klasse, keinem Volk und keinem Hintergrund dieses Charakters.</p>
          <ul class="fp-list">
            {#each orphanRows as { e, i } (i)}
              <li class="feat-row">
                <div class="fp-head">
                  <span class="fp-name ref-unlinked" title="Kein Merkmal dieses Keys am Charakter">⚠ {e.name.trim() || e.sourceKey || '(ohne Merkmal)'}</span>
                  <span class="fp-choice">Entscheidung: {choiceDisplay(e)}</span>
                  <span class="feat-row-actions">
                    <button class="remove-btn" title="Eintrag löschen" onclick={() => removeEntry(i)}>✕</button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  </div>
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
  .fpanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    background: var(--bg-panel);
    border-left: 1px solid var(--surface);
    color: var(--ink);
    font-size: 0.85rem;
  }

  .fpanel-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    padding: 0.55rem 0.75rem 0.4rem;
    border-bottom: 1px solid var(--surface);
  }
  .fpanel-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .fpanel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.6rem 0.75rem 1.5rem;
  }

  .fp-hint {
    font-size: 0.72rem;
    color: var(--ink-muted);
    margin: 0 0 0.7rem;
  }

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

  .ref-block {
    margin-bottom: 0.7rem;
    border: 1px solid var(--surface);
    border-radius: 6px;
    overflow: hidden;
  }
  details.ref-block > summary,
  .ref-block > h4 {   /* Verwaisten-Block: fester Kopf statt summary */
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    padding: 0.3rem 0.5rem;
    background: var(--bg-deep);
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--ink);
  }
  details.ref-block > summary { cursor: pointer; user-select: none; list-style: none; }
  details.ref-block > summary::-webkit-details-marker { display: none; }
  details.ref-block[open] > summary,
  .ref-block > h4 { border-bottom: 1px solid var(--surface); }
  details.ref-block > summary:hover .rb-title { color: var(--copper); }
  .rb-title { font-weight: inherit; }
  .rb-body { padding: 0.45rem 0.55rem; }
  .rb-open {
    margin-left: auto;
    font-size: 0.68rem; font-weight: 700; color: var(--gold);
    border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    border-radius: 999px; padding: 0.02rem 0.4rem;
  }

  .fp-group { margin-top: 0.85rem; }
  .rb-body > .fp-group:first-child { margin-top: 0; }
  .fp-title {
    display: block;
    color: var(--copper);
    font-weight: 700; font-size: 0.78rem;
    text-transform: uppercase; letter-spacing: 0.05em;
    padding-bottom: 0.15rem;
    border-bottom: 1px solid color-mix(in srgb, var(--copper) 30%, transparent);
  }
  .fp-unresolved { color: var(--ink-muted); font-style: italic; font-size: 0.8rem; margin-left: 0.3rem; }
  .fp-list { list-style: none; margin: 0.45rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .fp-list li {
    margin: 0; padding: 0.4rem 0.55rem;
    border: 1px solid var(--border); border-radius: 5px;
    background: color-mix(in srgb, var(--surface) 40%, transparent);
  }
  .fp-head { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
  .fp-name { font-weight: 700; font-variant: small-caps; color: var(--ink); }
  .fp-lvl { color: var(--ink-muted); font-size: 0.72rem; font-style: italic; }
  .fp-choice {
    color: var(--gold); font-size: 0.72rem; font-weight: 600;
    border: 1px solid var(--border); border-radius: 999px; padding: 0.02rem 0.4rem;
    background: color-mix(in srgb, var(--surface) 60%, transparent);
  }
  .chip-x {
    background: none; border: none; cursor: pointer; font: inherit;
    padding: 0 0 0 0.25rem; color: var(--ink-muted);
  }
  .chip-x:hover { color: var(--danger); }
  .fp-desc { color: var(--ink-soft); font-size: 0.78rem; line-height: 1.5; margin-top: 0.15rem; }
  .fp-empty { color: var(--ink-muted); font-style: italic; font-size: 0.8rem; margin: 0.3rem 0 0; }
  .ref-unlinked { display: inline-block; margin-top: 0.15rem; font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }

  .feat-row .fp-head { align-items: center; }
  .fp-name-link {
    background: none; border: none; padding: 0; font: inherit; cursor: pointer;
    font-weight: 700; font-variant: small-caps; color: var(--ink);
    text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--gold) 55%, transparent);
    text-underline-offset: 0.15em;
  }
  .fp-name-link:hover { color: var(--gold); }
  .fp-prereq { margin-top: 0.15rem; font-size: 0.74rem; font-style: italic; color: color-mix(in srgb, var(--gold) 70%, var(--ink)); }
  .feat-row-actions { margin-left: auto; display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }
  .feat-lvl { display: flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; color: var(--ink-muted); }
  .feat-lvl .ref-level { width: 3.2rem; font: inherit; font-size: 0.78rem; }
  .feat-loading { color: var(--ink-muted); }

  .link-edit {
    background: none; border: none; cursor: pointer; padding: 0 0.2rem;
    color: var(--ink-muted); font-size: 0.8rem; flex-shrink: 0;
  }
  .link-edit:hover { color: var(--ink); }

  .remove-btn {
    background: none; border: none; cursor: pointer;
    color: var(--border); font-size: 0.75rem; padding: 0.1rem 0.2rem;
  }
  .remove-btn:hover { color: var(--danger); }

  .feat-add-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .feat-picker { flex: 1; min-width: 10rem; }
  .feat-add-row .btn-add { flex-shrink: 0; white-space: nowrap; }

  .btn-add {
    background: var(--surface);
    color: var(--ink);
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .btn-add:hover { background: var(--border); }

  .sug-empty { color: var(--ink-muted); font-style: italic; cursor: default; }
</style>
