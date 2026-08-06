<script lang="ts">
  /**
   * Kompakte Formularzeile; die eigentliche Wahl passiert im `SpellPickModal`, damit
   * Schritt und Fragebogen kurz bleiben statt je Kontingent eine offene Suchliste zu tragen.
   */
  import { spellInfoByKey, type SpellInfo } from '../spellLibrary';
  import { NO_KNOWN_SPELLS, type KnownSpells } from '../services/spellcasting/known';
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
    known = NO_KNOWN_SPELLS,
    prepared = $bindable(undefined),
    preparedMax = 0,
    allowCreate = false,
    onCreate = undefined,
  }: {
    title: string;
    library: SpellInfo[];
    spellLevels: number[];
    /** Deutsch oder englischer Key; leer = alle Klassen. */
    spellClass?: string;
    max: number;
    /** Gewählte Zauber als `spell.key`. */
    picks: string[];
    /** Fest gewährte Zauber (Merkmale) — angezeigt, nicht wählbar, zählen nicht mit. */
    fixed?: { level: number; name: string }[];
    /** Woanders schon beherrscht — ausgegraut, aber wählbar. */
    known?: KnownSpells;
    prepared?: string[] | undefined;
    preparedMax?: number;
    allowCreate?: boolean;
    onCreate?: (name: string, levels: number[]) => void;
  } = $props();

  let open = $state(false);

  const label = (level: number, name: string) => (level > 0 ? `${name} (Grad ${level})` : name);
  const complete = $derived(picks.length >= max && (!prepared || prepared.length >= preparedMax));
  const hover = createSpellHover(() => new Map(library.map((s) => [s.name, s])));
  const infoOf = (key: string) => spellInfoByKey(library, key);
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
      {@const info = infoOf(val)}
      {@const from = known.get(val) ?? ''}
      <span
        class="pick"
        class:doubled={!!from}
        class:unprepared={prepared ? !prepared.includes(val) : false}
        title={from ? `Beherrschst du schon (${from}) — die zweite Wahl bringt nichts Neues.` : undefined}
        onmouseenter={(e) => info && hover.show(e, info.name)}
        onmousemove={(e) => hover.move(e)}
        onmouseleave={() => hover.hide()}
        role="note"
      >
        <!-- Nur Anzeige: geschaltet wird die Vorbereitung im Auswahl-Dialog. -->
        {#if prepared}{prepared.includes(val) ? '●' : '○'} {/if}{#if from}◇ {/if}{info ? label(info.level, info.name) : val}
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
    {known}
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
  .pick.doubled { border-style: dotted; color: var(--ink-muted); font-style: italic; }
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
