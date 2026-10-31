<script lang="ts">
  import { ABILITY_KEYS, ABILITY_LABEL } from '$lib/schemas/abilities';
  import { abilityEffectSchema, type AbilityEffect } from '$lib/schemas/item';
  import { abilityEffectText } from '$lib/services/itemDeclarations';
  import JsonOnlyRow from './JsonOnlyRow.svelte';

  let { effect = $bindable() }: { effect: AbilityEffect } = $props();

  // `onSetBy` nennt Item-Keys anderer Gegenstände (Gürtel der Riesenstärke) — dafür gibt es kein Feld.
  const editable = $derived(effect.kind === 'set' || !effect.onSetBy.length);

  function setKind(kind: AbilityEffect['kind']) {
    effect = abilityEffectSchema.parse({ kind, ability: effect.ability, value: effect.value });
  }

  function setMax(raw: string) {
    if (effect.kind !== 'add') return;
    effect.max = raw === '' ? undefined : Number(raw);
  }
</script>

{#if editable}
  <span class="fx">
    <select class="edit-select" bind:value={effect.ability}>
      {#each ABILITY_KEYS as k}<option value={k}>{ABILITY_LABEL[k]}</option>{/each}
    </select>
    <select class="edit-select" value={effect.kind} onchange={(e) => setKind((e.target as HTMLSelectElement).value as AbilityEffect['kind'])}>
      <option value="set">beträgt</option>
      <option value="add">Zuschlag</option>
    </select>
    <input class="edit-input num" type="number" bind:value={effect.value} />
    {#if effect.kind === 'add'}
      <label class="edit-check">höchstens
        <input class="edit-input num" type="number" min="1" max="30" value={effect.max ?? ''}
          oninput={(e) => setMax((e.target as HTMLInputElement).value)} />
      </label>
    {/if}
  </span>
{:else}
  <JsonOnlyRow text={abilityEffectText(effect)} />
{/if}

<style>
  .fx { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .num { width: 4.5rem; }
</style>
