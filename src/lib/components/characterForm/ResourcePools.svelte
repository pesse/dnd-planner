<script lang="ts">
  import { resourceViews } from '../../services/resources/project';
  import { findResource, refOf, type ResolvedResource } from '../../services/resources/resolve';
  import type { ResourceAdjustment } from '../../schemas/resource';
  import { groupedSpellcasting } from '../../services/spellcasting/grouped';
  import type { LoadedSpellcasting } from '../../services/spellcasting/project';
  import { setSlotTotals } from '../../services/spellcasting/write';
  import type { CharacterFormFields } from '../../services/characterFormFields';
  import ResourcePoolCards from '../character/ResourcePoolCards.svelte';
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

  const poolById = $derived(new Map(pools.map((p) => [p.id, p])));
  const visible = $derived(new Set(resources.map((r) => r.id)));
  const targetOf = (adj: ResourceAdjustment) => findResource(pools, adj.target, '');
  const adjustmentsOf = (id: string) => form.resourceAdjustments.filter((a) => targetOf(a)?.id === id);
  // Ohne sichtbare Karte (Ziel weg oder auf 0 gedrückt) brauchen sie trotzdem einen Ort zum Löschen.
  const stray = $derived(form.resourceAdjustments.filter((a) => !visible.has(targetOf(a)?.id ?? '')));

  function addAdjustment(pool: ResolvedResource) {
    form.resourceAdjustments.push({
      target: refOf(pool), amount: 1, reason: '',
      ...(pool.kind === 'slots' ? { grade: pool.max.findIndex((n) => n > 0) + 1 || 1 } : {}),
    });
  }
  function removeAdjustment(adj: ResourceAdjustment) {
    form.resourceAdjustments.splice(form.resourceAdjustments.indexOf(adj), 1);
  }

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
<ResourcePoolCards {resources}>
  {#snippet children(pool)}
    {#each adjustmentsOf(pool.id) as adj}
      {@render adjustmentRow(adj, poolById.get(pool.id)?.kind === 'slots')}
    {/each}
    {#if poolById.get(pool.id)}
      <button type="button" class="adj-add" onclick={() => addAdjustment(poolById.get(pool.id)!)}>± Anpassen</button>
    {/if}
  {/snippet}
</ResourcePoolCards>
{#if stray.length}
  <div class="stray">
    {#each stray as adj}
      {@const target = targetOf(adj)}
      <span class="stray-label">{target ? target.labelDe : 'Unbekannter Vorrat'}</span>
      {@render adjustmentRow(adj, target?.kind === 'slots')}
    {/each}
  </div>
{/if}

{#snippet adjustmentRow(adj: ResourceAdjustment, slots: boolean)}
  <div class="adj-row">
    <input class="adj-amount" type="number" step="1" bind:value={adj.amount} title="Zu- oder Abschlag" />
    {#if slots}
      <select bind:value={adj.grade} title="Grad">
        {#each Array.from({ length: 9 }, (_, i) => i + 1) as g}<option value={g}>Grad {g}</option>{/each}
      </select>
    {/if}
    <input class="adj-reason" bind:value={adj.reason} placeholder="Anlass, z. B. Segen" />
    <button type="button" class="adj-remove" title="Anpassung entfernen" onclick={() => removeAdjustment(adj)}>✕</button>
  </div>
{/snippet}
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
  .adj-row { display: flex; align-items: center; gap: 0.3rem; }
  .adj-row input, .adj-row select { font-size: 0.75rem; padding: 0.1rem 0.25rem; }
  .adj-amount { width: 3.2rem; text-align: center; }
  .adj-reason { flex: 1; min-width: 6rem; }
  .adj-add, .adj-remove {
    background: none; border: none; cursor: pointer; padding: 0;
    font-size: 0.7rem; color: var(--ink-muted);
  }
  .adj-add { align-self: flex-start; }
  .adj-add:hover, .adj-remove:hover { color: var(--arcane); }
  .stray { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; }
  .stray-label { font-size: 0.75rem; color: var(--ink-muted); }
</style>
