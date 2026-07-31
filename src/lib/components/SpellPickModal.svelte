<script lang="ts">
  /**
   * Zauber-Auswahl-Dialog: alle wählbaren Zauber als Toggle-Chips, nach Zaubergrad gruppiert.
   * Geöffnet wird er ausschließlich aus `SpellPickField`.
   *
   * Die Optionen kommen AUSSCHLIESSLICH aus `vault/spells`, gefiltert über `spellLevels` +
   * `spellClass` — nie aus einer KI-Antwort. Das ist der Halluzinationsschutz, dieselbe
   * Doktrin wie beim `WeaponMasteryPicker`.
   *
   * `picks`/`prepared` werden live durchgeschrieben: Schließen heißt „fertig", es gibt kein
   * Abbrechen. Damit bleibt das Gating des Aufrufers (`spellPicksDone`) ohne Zwischenzustand
   * reaktiv.
   */
  import { onMount } from 'svelte';
  import { resolveClass, searchSpells, SCHOOL_COLORS, type SpellInfo } from '../spellLibrary';
  import { encodePick } from '../services/spellcasting';
  import SpellTooltip from './SpellTooltip.svelte';
  import { createSpellHover } from './spellHover.svelte';

  let {
    title,
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
    onclose,
  }: {
    title: string;
    library: SpellInfo[];
    /** Erlaubte Zaubergrade; `[0]` = nur Zaubertricks. */
    spellLevels: number[];
    /** Klassenfilter (deutsch oder englischer Key); leer = alle Klassen. */
    spellClass?: string;
    max: number;
    /** Gewählte Zauber, `encodePick`-kodiert. */
    picks: string[];
    /** Fest gewährte Zauber (Merkmale) — angezeigt, nicht wählbar, zählen nicht mit. */
    fixed?: { level: number; name: string }[];
    /**
     * Nur für das Zauberbuch: Teilmenge von `picks`, die als vorbereitet gilt. Ist sie
     * gesetzt, bekommt jeder gewählte Chip einen Vorbereitungs-Schalter.
     */
    prepared?: string[] | undefined;
    preparedMax?: number;
    allowCreate?: boolean;
    onCreate?: (name: string, levels: number[]) => void;
    onclose: () => void;
  } = $props();

  let query = $state('');
  let searchEl = $state<HTMLInputElement | null>(null);
  onMount(() => searchEl?.focus());

  const englishClass = $derived(spellClass ? resolveClass(spellClass) : null);
  const fixedNames = $derived(new Set(fixed.map((f) => f.name.toLowerCase())));
  // Auch Grade einbeziehen, die nur ein gewährter Zauber mitbringt (ein Merkmal kann einen
  // Zauber oberhalb der eigenen Zauberplätze schenken) — sonst fiele er im Dialog stumm weg.
  const levels = $derived(
    [...new Set([...spellLevels, ...fixed.map((f) => f.level)])].sort((a, b) => a - b),
  );

  /**
   * Kandidaten: ohne Sucheingabe die vollständige klassen-/gradgefilterte Liste — als Chips
   * bewusst NICHT gekappt (der Body scrollt), ein stilles Abschneiden würde die Auswahl
   * unvollständig aussehen lassen.
   */
  const candidates = $derived.by(() => {
    const pool = query.trim()
      ? searchSpells(library, query, null, spellClass, 200).map((s) => s.spell)
      : library;
    return pool.filter(
      (s) =>
        spellLevels.includes(s.level) &&
        (!englishClass || s.classes.includes(englishClass)) &&
        !fixedNames.has(s.name.toLowerCase()),
    );
  });

  const sections = $derived(
    levels
      .map((level) => ({
        level,
        granted: fixed.filter(
          (f) => f.level === level && f.name.toLowerCase().includes(query.trim().toLowerCase()),
        ),
        spells: candidates
          .filter((s) => s.level === level)
          .sort((a, b) => a.name.localeCompare(b.name, 'de')),
      }))
      .filter((sec) => sec.granted.length || sec.spells.length),
  );

  const full = $derived(picks.length >= max);
  const isPicked = (s: SpellInfo) => picks.includes(encodePick(s.level, s.name));

  function toggle(s: SpellInfo) {
    const val = encodePick(s.level, s.name);
    if (picks.includes(val)) {
      picks = picks.filter((x) => x !== val);
      if (prepared) prepared = prepared.filter((x) => x !== val);
      return;
    }
    // Am Maximum blockieren statt die älteste Wahl herauszuschieben — ein stiller Verlust
    // wäre hier besonders teuer, die Auswahl ist der Kern des Schritts.
    if (full) return;
    picks = [...picks, val];
    if (prepared && prepared.length < preparedMax) prepared = [...prepared, val];
  }

  function togglePrepared(val: string) {
    if (!prepared) return;
    if (prepared.includes(val)) prepared = prepared.filter((x) => x !== val);
    else if (prepared.length < preparedMax) prepared = [...prepared, val];
  }

  const levelLabel = (level: number) => (level > 0 ? `Grad ${level}` : 'Zaubertricks');
  const hover = createSpellHover(() => new Map(library.map((s) => [s.name, s])));

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Flex-Zentrierung statt `translate(-50%,-50%)`: `SpellTooltip` ist ein `position: fixed`-Kind
     mit clientX/Y-Koordinaten und würde an einem transformierten Vorfahren falsch landen. -->
<div class="backdrop" role="presentation" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <header>
      <div class="head-text">
        <span class="modal-title">{title}</span>
        <span class="counter">
          {picks.length} / {max} gewählt{#if prepared} · {prepared.length} / {preparedMax} vorbereitet{/if}
        </span>
      </div>
      <button type="button" class="close-btn" title="Schließen" onclick={onclose}>×</button>
    </header>

    <input class="input" placeholder="Zauber filtern…" bind:this={searchEl} bind:value={query} />

    <div class="body">
      {#each sections as sec (sec.level)}
        <div class="section">
          <span class="section-title">{levelLabel(sec.level)}</span>
          <div class="chips">
            {#each sec.granted as f (f.name)}
              <!-- Bewusst kein `disabled`-Button: der schluckt die Mouse-Events und damit den
                   Tooltip, mit dem man den Zauber überhaupt nachlesen kann. -->
              <span
                class="chip granted"
                title="Von einem Merkmal gewährt — zählt nicht gegen dein Kontingent"
                onmouseenter={(e) => hover.show(e, f.name)}
                onmousemove={(e) => hover.move(e)}
                onmouseleave={() => hover.hide()}
                role="note"
              ><span class="chip-main">◆ {f.name}</span></span>
            {/each}
            {#each sec.spells as s (s.name)}
              {@const val = encodePick(s.level, s.name)}
              {@const picked = isPicked(s)}
              <span
                class="chip"
                class:sel={picked}
                class:unprepared={picked && prepared ? !prepared.includes(val) : false}
                style="border-left: 3px solid {SCHOOL_COLORS[s.school] ?? 'var(--border)'}"
              >
                <button
                  type="button"
                  class="chip-main"
                  class:blocked={!picked && full}
                  aria-pressed={picked}
                  title={!picked && full
                    ? 'Kontingent voll — entferne einen Zauber, um zu tauschen.'
                    : s.name_en && s.name_en !== s.name
                      ? s.name_en
                      : undefined}
                  onmouseenter={(e) => hover.show(e, s.name)}
                  onmousemove={(e) => hover.move(e)}
                  onmouseleave={() => hover.hide()}
                  onclick={() => toggle(s)}
                >{s.name}</button>
                {#if picked && prepared}
                  <button
                    type="button"
                    class="prep"
                    title={prepared.includes(val) ? 'Vorbereitet — klicken, um nur ins Buch zu legen' : 'Nur im Zauberbuch — klicken, um vorzubereiten'}
                    onclick={(e) => { e.stopPropagation(); togglePrepared(val); }}
                  >{prepared.includes(val) ? '●' : '○'}</button>
                {/if}
              </span>
            {/each}
          </div>
        </div>
      {/each}
      {#if !sections.length}
        <span class="field-hint">Keine Zauber für Klasse/Grad gefunden.</span>
      {/if}
    </div>

    <footer>
      {#if full}
        <span class="field-hint">Kontingent voll — entferne einen Zauber, um zu tauschen.</span>
      {/if}
      {#if allowCreate && query.trim()}
        <!-- Schließt mit: die Inline-Zauberanlage des Aufrufers liegt im Dialog dahinter. -->
        <button
          type="button"
          class="create-btn"
          onclick={() => { onCreate?.(query, spellLevels); onclose(); }}
        >＋ „{query}" als neuen Zauber anlegen</button>
      {/if}
      <button type="button" class="primary-btn" onclick={onclose}>Fertig</button>
    </footer>
  </div>
</div>

<SpellTooltip spell={hover.spell} x={hover.x} y={hover.y} />

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(20, 12, 2, 0.5);
    display: flex; align-items: center; justify-content: center; z-index: 1100;
  }
  .dialog {
    background: var(--bg); color: var(--ink);
    border: 1px solid var(--border-strong); border-radius: 10px;
    width: min(680px, 92vw); max-height: 84vh;
    display: flex; flex-direction: column; gap: 0.6rem;
    padding: 0 1.1rem 0.9rem;
    box-shadow: 0 12px 40px rgba(20, 12, 2, 0.4);
  }
  header {
    display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
    margin: 0 -1.1rem; padding: 0.7rem 1.1rem; border-bottom: 1px solid var(--border);
  }
  .head-text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .modal-title { font-weight: 700; font-size: 1rem; color: var(--ink); font-family: var(--font-display, inherit); }
  .counter { font-size: 0.75rem; color: var(--ink-muted); }
  .close-btn { background: none; border: none; color: var(--ink-muted); font-size: 1.3rem; line-height: 1; cursor: pointer; }
  .close-btn:hover { color: var(--ink); }
  .input {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.35rem 0.5rem; outline: none;
    font-family: inherit; width: 100%;
  }
  .input:focus { border-color: var(--arcane, var(--red)); }
  .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
  .section { display: flex; flex-direction: column; gap: 0.3rem; }
  .section-title {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted);
  }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    display: inline-flex; align-items: center;
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    overflow: hidden;
  }
  .chip:hover { border-color: var(--border-strong); }
  .chip.sel { background: var(--arcane, var(--gold)); border-color: transparent; }
  .chip.sel .chip-main { color: var(--on-accent, #fff); font-weight: 600; }
  .chip.granted { border-style: dashed; cursor: help; }
  .chip-main {
    background: none; border: none; cursor: pointer; font: inherit; font-size: 0.82rem;
    color: var(--ink-soft); padding: 0.25rem 0.65rem;
  }
  .chip-main.blocked { cursor: not-allowed; opacity: 0.4; }
  .chip.granted .chip-main { color: var(--ink-soft); opacity: 0.85; cursor: help; }
  .chip.sel.unprepared { opacity: 0.72; }
  .prep {
    background: none; border: none; cursor: pointer; line-height: 1; font-size: 0.7rem;
    color: var(--on-accent, #fff); padding: 0.25rem 0.5rem 0.25rem 0;
  }
  footer { display: flex; align-items: center; gap: 0.6rem; justify-content: flex-end; }
  .create-btn {
    background: none; border: none; cursor: pointer; font-family: inherit; font-size: 0.78rem;
    font-style: italic; color: var(--arcane, var(--red)); margin-right: auto; text-align: left;
  }
  .primary-btn { background: var(--arcane, var(--red)); color: var(--on-accent, #fff); border-radius: 5px; }
  .field-hint { color: var(--ink-muted); font-size: 0.72rem; margin-right: auto; }
</style>
