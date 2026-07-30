<script lang="ts">
  /**
   * Zauber-Auswahl als kompakte Formularzeile: gewählte Zauber als Badges, Zähler,
   * „Auswählen"-Knopf. Die eigentliche Wahl passiert im `SpellPickModal` — der Schritt bzw.
   * Fragebogen bleibt dadurch kurz, statt pro Kontingent eine offene Suchliste zu tragen.
   *
   * Prop-gleich zum früheren Inline-Picker (plus `title` für den Dialogkopf), damit
   * Erstell-Wizard und Stufenaufstieg dieselbe Zeile benutzen.
   */
  import { decodePick } from '../services/spellcasting';
  import type { SpellInfo } from '../spellLibrary';
  import SpellTooltip from './SpellTooltip.svelte';
  import SpellPickModal from './SpellPickModal.svelte';
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
  }: {
    /** Klartext-Titel des Auswahl-Dialogs. */
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
    /** Nur für das Zauberbuch: Teilmenge von `picks`, die als vorbereitet gilt. */
    prepared?: string[] | undefined;
    preparedMax?: number;
    allowCreate?: boolean;
    onCreate?: (name: string, levels: number[]) => void;
  } = $props();

  let open = $state(false);

  const label = (level: number, name: string) => (level > 0 ? `${name} (Grad ${level})` : name);
  const complete = $derived(picks.length >= max && (!prepared || prepared.length >= preparedMax));
  const hover = createSpellHover(() => new Map(library.map((s) => [s.name, s])));
</script>

<div class="field-row">
  <div class="chips">
    {#each fixed as f (f.name)}
      <span
        class="pick granted"
        title="Von einem Merkmal gewährt — zählt nicht gegen dein Kontingent"
        onmouseenter={(e) => hover.show(e, f.name)}
        onmousemove={(e) => hover.move(e)}
        onmouseleave={() => hover.hide()}
        role="note"
      >◆ {label(f.level, f.name)}</span>
    {/each}
    {#each picks as val (val)}
      {@const dp = decodePick(val)}
      <span
        class="pick"
        class:unprepared={prepared ? !prepared.includes(val) : false}
        onmouseenter={(e) => hover.show(e, dp.name)}
        onmousemove={(e) => hover.move(e)}
        onmouseleave={() => hover.hide()}
        role="note"
      >
        <!-- Nur Anzeige: geschaltet wird die Vorbereitung im Auswahl-Dialog. -->
        {#if prepared}{prepared.includes(val) ? '●' : '○'} {/if}{label(dp.level, dp.name)}
      </span>
    {/each}
    {#if !picks.length && !fixed.length}
      <span class="field-hint">Noch keine Zauber gewählt.</span>
    {/if}
  </div>

  <div class="controls">
    <span class="counter" class:done={complete}>
      {picks.length} / {max}{#if prepared} · {prepared.length} / {preparedMax} vorb.{/if}{#if complete} ✓{/if}
    </span>
    <button type="button" class="pick-btn" onclick={() => (open = true)}>
      {picks.length ? 'Ändern' : 'Auswählen'}
    </button>
  </div>
</div>

{#if open}
  <SpellPickModal
    {title}
    {library}
    {spellLevels}
    {spellClass}
    {max}
    bind:picks
    {fixed}
    bind:prepared
    {preparedMax}
    {allowCreate}
    {onCreate}
    onclose={() => (open = false)}
  />
{/if}

<SpellTooltip spell={hover.spell} x={hover.x} y={hover.y} />

<style>
  .field-row { display: flex; align-items: flex-start; gap: 0.6rem; }
  .chips { flex: 1 1 auto; min-width: 0; display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
  .pick {
    display: inline-flex; align-items: center; gap: 0.2rem;
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    padding: 0.12rem 0.5rem; font-size: 0.74rem; color: var(--ink); cursor: help;
  }
  .pick.granted { border-style: dashed; color: var(--ink-soft); }
  .pick.unprepared { color: var(--ink-muted); }
  .controls { flex: 0 0 auto; display: flex; align-items: center; gap: 0.5rem; }
  .counter { font-size: 0.72rem; color: var(--ink-muted); white-space: nowrap; }
  .counter.done { color: var(--green, var(--ink-soft)); }
  .pick-btn {
    background: var(--surface); border: 1px solid var(--border-strong); border-radius: 5px;
    color: var(--ink); font-family: inherit; font-size: 0.8rem; padding: 0.25rem 0.7rem; cursor: pointer;
  }
  .pick-btn:hover { border-color: var(--arcane, var(--red)); }
  .field-hint { color: var(--ink-muted); font-size: 0.72rem; }
</style>
