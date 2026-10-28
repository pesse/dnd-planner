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
<div class="pools">
  {#each resources as pool (pool.id)}
    <div class="pool">
      <div class="pool-head">
        <span class="pool-label">{pool.label}</span>
        {#if pool.hint}<span class="pool-hint">{pool.hint}</span>{/if}
      </div>
      <div class="pool-cells">
        {#each pool.cells as cell (cell.label)}
          <span class="cell">
            <span class="count">{cell.count}</span>
            {#if cell.label}<span class="cell-label">{cell.label}</span>{/if}
          </span>
        {/each}
      </div>
    </div>
  {/each}
</div>
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
  .pools { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.4rem 0 0.5rem; }
  .pool {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem 0.5rem;
    min-width: 10rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .pool-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
  .pool-label { font-weight: 600; font-size: 0.82rem; }
  .pool-hint { font-size: 0.68rem; color: var(--ink-muted); white-space: nowrap; }
  .pool-cells { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .cell {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    min-width: 2.6rem;
    padding: 0.15rem 0.35rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .count { font-size: 1.05rem; font-weight: 700; color: var(--arcane); }
  .cell-label { font-size: 0.62rem; color: var(--ink-muted); }
</style>
