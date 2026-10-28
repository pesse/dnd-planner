<script lang="ts">
  import { resourceViews } from '../../services/resources/project';
  import { groupedSpellcasting } from '../../services/spellcasting/grouped';
  import type { LoadedSpellcasting } from '../../services/spellcasting/project';
  import { setSlotTotals } from '../../services/spellcasting/write';
  import type { CharacterFormFields } from '../../services/characterFormFields';
  import './form.css';

  let { form, casting }: {
    form: CharacterFormFields;
    casting: LoadedSpellcasting | null;
  } = $props();

  const block = $derived(form.spellcasting);
  const pools = $derived(casting ? groupedSpellcasting(casting.state, casting.lookup).resources : []);
  const resources = $derived(resourceViews(pools));
  // Von Hand nur, wo keine Klassentabelle Plätze hergibt — sonst schlüge die Eingabe die Progression.
  const manualSlots = $derived(!pools.some((p) => p.kind === 'slots' && p.origin !== 'manual'));

  function onSlotTotals(level: number, total: number) {
    const totals = Array.from({ length: 9 }, (_, i) => block.manual?.slotTotals[i] ?? 0);
    totals[level - 1] = total;
    setSlotTotals(block, totals);
    form.spellcasting = { ...block };
  }
</script>

<p class="auto-hint">
  Abgeleitet aus Klasse, Merkmalen und angelegten Gegenständen. Verbraucht wird auf dem
  gedruckten Bogen.
</p>
{#each resources as pool (pool.id)}
  <div class="pool-row">
    <span class="pool-label">{pool.label}{#if pool.hint}<span class="pool-hint">{pool.hint}</span>{/if}</span>
    <div class="tag-list">
      {#each pool.cells as cell (cell.label)}
        <span class="tag slot-tag">{cell.label ? `${cell.label}: ` : ''}{cell.count}</span>
      {/each}
    </div>
  </div>
{/each}
{#if manualSlots}
  <p class="auto-hint">Keine Progression in der Bibliothek — Plätze von Hand.</p>
  <div class="slot-edit-row">
    {#each Array.from({ length: 9 }, (_, i) => i + 1) as level}
      <label class="slot-label">S{level}
        <input type="number" min="0" max="9"
          value={block.manual?.slotTotals[level - 1] ?? 0}
          onchange={(e) => onSlotTotals(level, Number(e.currentTarget.value) || 0)} />
      </label>
    {/each}
  </div>
{:else if !resources.length}
  <p class="auto-hint">Keine Vorräte auf dieser Stufe.</p>
{/if}

<style>
  .pool-row { display: flex; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap; }
  .pool-label {
    font-size: 0.75rem; color: var(--ink-muted); min-width: 11rem;
    display: flex; flex-direction: column; gap: 0.1rem;
  }
  .pool-hint { font-size: 0.7rem; color: var(--ink-faint); }
</style>
