<script lang="ts">
  /** Magische Facette eines Gegenstands: Seltenheit, Einstimmung. */
  import type { Item } from '$lib/types';
  import { RARITY_LABELS } from '$lib/itemLabels';

  let { draft = $bindable(), rarityName = $bindable() }: { draft: Item; rarityName: string } = $props();

  const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
</script>

<div class="prop-row">
  <span class="prop-label">Seltenheit</span>
  <select class="edit-select" bind:value={rarityName}>
    <option value="">— keine —</option>
    {#each RARITY_OPTIONS as r}
      <option value={r}>{RARITY_LABELS[r] ?? r}</option>
    {/each}
  </select>
</div>
<div class="prop-row">
  <span class="prop-label">Einstimmung</span>
  <label class="edit-check">
    <input type="checkbox" bind:checked={draft.attunement} />
    Erforderlich
  </label>
</div>
{#if draft.attunement}
  <div class="prop-row">
    <span class="prop-label">Voraussetzung</span>
    <input class="edit-input" bind:value={draft.attunement_by} placeholder="z.B. by a wizard" />
  </div>
{/if}
