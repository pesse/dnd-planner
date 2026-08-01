<script lang="ts">
  /** Für jeden Gegenstand: Kosten (Menge + Münze) und Gewicht. */
  import type { Item } from '$lib/types';
  import { COST_UNIT_LABELS } from '$lib/itemLabels';

  let { draft = $bindable() }: { draft: Item } = $props();

  const COST_UNITS = ['gp', 'sp', 'cp', 'ep', 'pp'];
</script>

<div class="prop-row">
  <span class="prop-label">Kosten</span>
  <div class="cost-inputs">
    <input class="edit-input cost-qty" type="number" min="0"
      value={draft.cost?.quantity ?? ''}
      oninput={(e) => {
        const v = (e.target as HTMLInputElement).value;
        draft.cost = v ? { quantity: parseFloat(v), unit: draft.cost?.unit ?? 'gp' } : undefined;
      }}
      placeholder="0" />
    <select class="edit-select"
      value={draft.cost?.unit ?? 'gp'}
      onchange={(e) => { if (draft.cost) draft.cost.unit = (e.target as HTMLSelectElement).value; }}>
      {#each COST_UNITS as u}<option value={u}>{COST_UNIT_LABELS[u] ?? u}</option>{/each}
    </select>
  </div>
</div>
<div class="prop-row">
  <span class="prop-label">Gewicht</span>
  <input class="edit-input" type="number" min="0" step="0.5"
    value={draft.weight ?? ''}
    oninput={(e) => {
      const v = (e.target as HTMLInputElement).value;
      draft.weight = v ? parseFloat(v) : undefined;
    }}
    placeholder="lbs" />
</div>

<style>
  .cost-inputs { display: flex; gap: 0.3rem; align-items: center; }
  .cost-qty { width: 5rem; flex-shrink: 0; }
</style>
