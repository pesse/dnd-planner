<script lang="ts">
  /** Rüstungswerte: Kategorie, Rüstungsklasse, Stärkevoraussetzung, Heimlichkeit. */
  import type { Item } from '$lib/types';
  import { ARMOR_CATEGORY_LABELS } from '$lib/itemLabels';

  let { draft = $bindable() }: { draft: Item } = $props();

  const ARMOR_CATEGORIES = ['Light', 'Medium', 'Heavy', 'Shield'];
</script>

<div class="prop-row">
  <span class="prop-label">Kategorie</span>
  <select class="edit-select" bind:value={draft.armor_category}>
    <option value="">—</option>
    {#each ARMOR_CATEGORIES as c}
      <option value={c}>{ARMOR_CATEGORY_LABELS[c]}</option>
    {/each}
  </select>
</div>
<div class="prop-row">
  <span class="prop-label">RK Basis</span>
  <input class="edit-input" type="number" min="0"
    value={draft.armor_class?.base ?? ''}
    oninput={(e) => {
      const v = (e.target as HTMLInputElement).value;
      draft.armor_class = v ? {
        base: parseInt(v),
        dex_bonus: draft.armor_class?.dex_bonus ?? false,
        max_bonus: draft.armor_class?.max_bonus ?? null,
      } : undefined;
    }}
    placeholder="z.B. 16" />
</div>
{#if draft.armor_class}
  <div class="prop-row">
    <span class="prop-label">GES-Bonus</span>
    <label class="edit-check">
      <input type="checkbox" bind:checked={draft.armor_class.dex_bonus} />
      erlaubt
      {#if draft.armor_class.dex_bonus}
        <input class="edit-input max-bonus-input" type="number" min="0"
          value={draft.armor_class.max_bonus ?? ''}
          oninput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            draft.armor_class!.max_bonus = v ? parseInt(v) : null;
          }}
          placeholder="max." />
      {/if}
    </label>
  </div>
{/if}
<div class="prop-row">
  <span class="prop-label">Stärke mind.</span>
  <input class="edit-input" type="number" min="0"
    value={draft.str_minimum ?? ''}
    oninput={(e) => {
      const v = (e.target as HTMLInputElement).value;
      draft.str_minimum = v ? parseInt(v) : undefined;
    }}
    placeholder="—" />
</div>
<div class="prop-row">
  <span class="prop-label">Heimlichkeit</span>
  <label class="edit-check">
    <input type="checkbox" bind:checked={draft.stealth_disadvantage} />
    Nachteil
  </label>
</div>

<style>
  .max-bonus-input { width: 4rem; flex-shrink: 0; }
</style>
