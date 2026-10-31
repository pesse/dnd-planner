<script lang="ts">
  import type { Item } from '$lib/types';
  import { DAMAGE_TYPES, type DamageType } from '$lib/schemas/vocabulary';
  import { DAMAGE_TYPE_LABELS, damageTypeShort } from '$lib/itemLabels';

  let { draft = $bindable() }: { draft: Item } = $props();

  function toggle(t: DamageType, on: boolean) {
    const current = draft.resistanceChoice?.types ?? [];
    const types = on ? DAMAGE_TYPES.filter((x) => x === t || current.includes(x)) : current.filter((x) => x !== t);
    draft.resistanceChoice = types.length ? { types, descDe: draft.resistanceChoice?.descDe ?? '' } : undefined;
  }
</script>

<div class="group">
  <span class="prop-label">Resistenz nach Wahl</span>
  <span class="checks">
    {#each DAMAGE_TYPES as t}
      <label class="edit-check">
        <input type="checkbox" checked={draft.resistanceChoice?.types.includes(t) ?? false}
          onchange={(e) => toggle(t, (e.target as HTMLInputElement).checked)} />
        {damageTypeShort(DAMAGE_TYPE_LABELS[t])}
      </label>
    {/each}
  </span>
  {#if draft.resistanceChoice}
    <textarea class="edit-input" rows="2" bind:value={draft.resistanceChoice.descDe}
      placeholder={'Text nach der Wahl, „{damage}" steht für die Schadensart'}></textarea>
  {/if}
</div>

<style>
  .group { display: flex; flex-direction: column; gap: 0.3rem; }
  .checks { display: flex; flex-wrap: wrap; gap: 0.2rem 0.7rem; }
</style>
