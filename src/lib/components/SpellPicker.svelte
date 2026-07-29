<script lang="ts" module>
  import { loadSpellByPath } from '../spellLibrary';
  import type { Spell } from '../types';

  /**
   * Vollständige Zauberdaten für den Hover-Tooltip, MODUL-weit geteilt: mehrere Picker sind
   * gleichzeitig montiert (Zaubertricks, Grad 1+, je Merkmals-Wahl einer) und greifen auf
   * dieselben Zauber zu. Anders als im Charakterbogen wird NICHT vorab geladen — die
   * Browse-Liste zeigt bis zu 60 Zauber, das wären 60 Dateizugriffe für einen Hover.
   */
  const spellCache = new Map<string, Spell | null>();

  async function loadSpell(name: string, path: string): Promise<Spell | null> {
    const hit = spellCache.get(name);
    if (hit !== undefined) return hit;
    const data = await loadSpellByPath(path);
    spellCache.set(name, data);
    return data;
  }
</script>

<script lang="ts">
  /**
   * Zauber-Picker: das gemeinsame UI für Stufenaufstieg UND Erstell-Wizard. Rein
   * präsentierend — die Bibliothek (`library`) beschafft der Aufrufer über
   * `getSpellLibrary()`, weil beide Kontexte an unterschiedlicher Stelle gaten (Fragebogen-
   * Frage vs. optionaler Wizard-Schritt) und der Wizard sie ohnehin für die Kontingente hält.
   *
   * Die Optionen kommen AUSSCHLIESSLICH aus `vault/spells`, gefiltert über `spellLevels` +
   * `spellClass` — nie aus einer KI-Antwort. Das ist der Halluzinationsschutz, dieselbe
   * Doktrin wie beim `WeaponMasteryPicker`.
   */
  import { resolveClass, searchSpells, SCHOOL_COLORS, type SpellInfo } from '../spellLibrary';
  import { decodePick, encodePick } from '../services/spellcasting';
  import SpellTooltip from './SpellTooltip.svelte';

  let {
    library,
    spellLevels,
    spellClass = '',
    max,
    picks = $bindable(),
    fixed = [],
    prepared = $bindable(undefined),
    preparedMax = 0,
    allowCreate = false,
    onCreate = undefined,
  }: {
    library: SpellInfo[];
    /** Erlaubte Zaubergrade; `[0]` = nur Zaubertricks. */
    spellLevels: number[];
    /** Klassenfilter (deutsch oder englischer Key); leer = alle Klassen. */
    spellClass?: string;
    max: number;
    /** Gewählte Zauber, `encodePick`-kodiert. */
    picks: string[];
    /** Fest gewährte Zauber (Merkmale) — angezeigt, nicht entfernbar, zählen nicht mit. */
    fixed?: { level: number; name: string }[];
    /**
     * Nur für das Zauberbuch: Teilmenge von `picks`, die als vorbereitet gilt. Ist sie
     * gesetzt, bekommt jeder Pick einen Vorbereitungs-Schalter.
     */
    prepared?: string[] | undefined;
    preparedMax?: number;
    allowCreate?: boolean;
    onCreate?: (name: string, levels: number[]) => void;
  } = $props();

  let query = $state('');

  const englishClass = $derived(spellClass ? resolveClass(spellClass) : null);
  const fixedNames = $derived(new Set(fixed.map((f) => f.name.toLowerCase())));

  const results = $derived.by(() => {
    if (!query.trim()) {
      // Browsen ohne Sucheingabe: die klassen-/gradgefilterte Auswahlliste.
      return library
        .filter((s) => spellLevels.includes(s.level) && (!englishClass || s.classes.includes(englishClass)))
        .slice(0, 60);
    }
    return searchSpells(library, query, null, spellClass, 30)
      .map((s) => s.spell)
      .filter((s) => spellLevels.includes(s.level))
      .slice(0, 12);
  });

  const full = $derived(picks.length >= max);

  function add(s: SpellInfo) {
    const val = encodePick(s.level, s.name);
    // Am Maximum blockieren statt die älteste Wahl herauszuschieben — ein stiller Verlust
    // wäre hier besonders teuer, die Auswahl ist der Kern des Schritts.
    if (picks.includes(val) || fixedNames.has(s.name.toLowerCase()) || full) return;
    picks = [...picks, val];
    if (prepared && prepared.length < preparedMax) prepared = [...prepared, val];
    query = '';
  }

  function remove(val: string) {
    picks = picks.filter((x) => x !== val);
    if (prepared) prepared = prepared.filter((x) => x !== val);
  }

  function togglePrepared(val: string) {
    if (!prepared) return;
    if (prepared.includes(val)) prepared = prepared.filter((x) => x !== val);
    else if (prepared.length < preparedMax) prepared = [...prepared, val];
  }

  const label = (level: number, name: string) => (level > 0 ? `${name} (Grad ${level})` : name);

  // ── Hover-Tooltip (wie im Charakterbogen) ───────────────────────────────────────
  const byName = $derived(new Map(library.map((s) => [s.name, s])));
  let tooltip = $state<Spell | null>(null);
  let tipX = $state(0);
  let tipY = $state(0);
  /** Name, über dem die Maus JETZT steht — verhindert, dass ein langsamer Ladevorgang
   *  den Tooltip aufpoppt, nachdem die Maus längst weiter ist. */
  let hovering = '';

  async function showTip(e: MouseEvent, name: string) {
    tipX = e.clientX + 14;
    tipY = e.clientY + 14;
    hovering = name;
    const info = byName.get(name);
    if (!info?.path) return;
    const data = await loadSpell(name, info.path);
    if (data && hovering === name) tooltip = data;
  }
  function moveTip(e: MouseEvent) {
    if (!tooltip) return;
    tipX = e.clientX + 14;
    tipY = e.clientY + 14;
  }
  function hideTip() {
    hovering = '';
    tooltip = null;
  }
</script>

<div class="picker">
  {#if fixed.length}
    <div class="chips">
      {#each fixed as f (f.name)}
        <span
          class="pick granted"
          title="Von einem Merkmal gewährt — zählt nicht gegen dein Kontingent"
          onmouseenter={(e) => showTip(e, f.name)}
          onmousemove={moveTip}
          onmouseleave={hideTip}
          role="note"
        >
          ◆ {label(f.level, f.name)}
        </span>
      {/each}
    </div>
  {/if}

  <div class="chips">
    {#each picks as val (val)}
      {@const dp = decodePick(val)}
      <span class="pick" class:unprepared={prepared ? !prepared.includes(val) : false}>
        {#if prepared}
          <button
            type="button"
            class="prep"
            title={prepared.includes(val) ? 'Vorbereitet — klicken, um nur ins Buch zu legen' : 'Nur im Zauberbuch — klicken, um vorzubereiten'}
            onclick={() => togglePrepared(val)}
          >{prepared.includes(val) ? '●' : '○'}</button>
        {/if}
        <span
          class="pick-name"
          onmouseenter={(e) => showTip(e, dp.name)}
          onmousemove={moveTip}
          onmouseleave={hideTip}
          role="note"
        >{label(dp.level, dp.name)}</span>
        <button type="button" title="Entfernen" onclick={() => remove(val)}>×</button>
      </span>
    {/each}
  </div>

  {#if full}
    <span class="field-hint">Kontingent voll — entferne einen Zauber, um zu tauschen.</span>
  {:else}
    <input
      class="input"
      placeholder="Zauber suchen oder aus der Liste wählen…"
      bind:value={query}
    />
    <div class="results">
      {#each results as s (s.name)}
        <button
          type="button"
          class="result"
          style="border-left: 2px solid {SCHOOL_COLORS[s.school] ?? 'var(--border)'}"
          disabled={picks.includes(encodePick(s.level, s.name)) || fixedNames.has(s.name.toLowerCase())}
          onmouseenter={(e) => showTip(e, s.name)}
          onmousemove={moveTip}
          onmouseleave={hideTip}
          onclick={() => add(s)}
        >
          {s.name}{s.name_en && s.name_en !== s.name ? ` (${s.name_en})` : ''}{s.level > 0 ? ` · Grad ${s.level}` : ' · Trick'}
        </button>
      {/each}
      {#if !results.length}
        <span class="field-hint">Keine Zauber für Klasse/Grad gefunden.</span>
      {/if}
      {#if allowCreate && query.trim()}
        <button type="button" class="result create" onclick={() => onCreate?.(query, spellLevels)}>
          ＋ „{query}" als neuen Zauber anlegen
        </button>
      {/if}
    </div>
  {/if}

  <span class="field-hint">
    {picks.length} / {max} gewählt{#if prepared}, {prepared.length} / {preparedMax} vorbereitet{/if}
  </span>
</div>

<SpellTooltip spell={tooltip} x={tipX} y={tipY} />

<style>
  .picker { display: flex; flex-direction: column; gap: 0.35rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .pick {
    display: inline-flex; align-items: center; gap: 0.3rem;
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    padding: 0.12rem 0.5rem; font-size: 0.74rem; color: var(--ink);
  }
  .pick.granted { border-style: dashed; color: var(--ink-soft); }
  .pick-name { cursor: help; }
  .pick.unprepared { color: var(--ink-muted); }
  .pick button { background: none; border: none; color: var(--ink-muted); cursor: pointer; font-size: 0.9rem; line-height: 1; }
  .pick button:hover { color: var(--danger); }
  .pick button.prep { font-size: 0.7rem; }
  .pick button.prep:hover { color: var(--arcane, var(--red)); }
  .input {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.35rem 0.5rem; outline: none;
    font-family: inherit; width: 100%;
  }
  .input:focus { border-color: var(--arcane, var(--red)); }
  .results { display: flex; flex-direction: column; gap: 0.15rem; max-height: 180px; overflow-y: auto; }
  .result {
    text-align: left; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); padding: 0.25rem 0.5rem;
    cursor: pointer; font-family: inherit; font-size: 0.78rem;
  }
  .result:hover { border-color: var(--arcane, var(--red)); color: var(--ink); }
  .result:disabled { opacity: 0.4; cursor: not-allowed; }
  .result.create { color: var(--arcane, var(--red)); font-style: italic; }
  .field-hint { text-transform: none; letter-spacing: 0; color: var(--ink-muted); font-size: 0.72rem; }
</style>
