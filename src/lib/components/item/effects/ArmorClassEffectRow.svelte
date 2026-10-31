<script lang="ts">
  import { ARMOR_CLASS_CONDITIONS, armorClassEffectSchema, type ArmorClassEffect } from '$lib/schemas/armorClass';
  import { CONDITION_DE } from '$lib/services/armorClass';
  import AbilityChecks from './AbilityChecks.svelte';
  import ConditionFields from './ConditionFields.svelte';

  let { effect = $bindable() }: { effect: ArmorClassEffect } = $props();

  const KINDS: Record<ArmorClassEffect['kind'], string> = {
    bonus: 'Zuschlag', unarmored: 'Basis ohne Rüstung', situational: 'Zuschlag in einer Lage',
  };

  function setKind(kind: ArmorClassEffect['kind']) {
    const value = 'value' in effect ? effect.value : 1;
    effect = armorClassEffectSchema.parse(
      kind === 'unarmored' ? { kind, abilities: ['dex'] }
      : kind === 'situational' ? { kind, value, condition: '' }
      : { kind, value },
    );
  }
</script>

<span class="fx">
  <select class="edit-select" value={effect.kind} onchange={(e) => setKind((e.target as HTMLSelectElement).value as ArmorClassEffect['kind'])}>
    {#each Object.entries(KINDS) as [k, label]}<option value={k}>{label}</option>{/each}
  </select>
  {#if effect.kind === 'bonus'}
    <input class="edit-input num" type="number" bind:value={effect.value} />
    <select class="edit-select" bind:value={effect.when}>
      {#each ARMOR_CLASS_CONDITIONS as c}<option value={c}>{CONDITION_DE[c] || 'immer'}</option>{/each}
    </select>
  {:else if effect.kind === 'unarmored'}
    <input class="edit-input num" type="number" bind:value={effect.base} title="Basis" />
    <AbilityChecks bind:selected={effect.abilities} hint="Mods dazu" />
    <label class="edit-check"><input type="checkbox" bind:checked={effect.shield} /> mit Schild</label>
  {:else}
    <input class="edit-input num" type="number" bind:value={effect.value} />
    <ConditionFields bind:target={effect} />
  {/if}
</span>

<style>
  .fx { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .num { width: 4.5rem; }
</style>
