<script lang="ts">
  import { savingThrowEffectSchema, type SavingThrowEffect } from '$lib/schemas/savingThrow';
  import { savingThrowEffectText } from '$lib/services/itemDeclarations';
  import AbilityChecks from './AbilityChecks.svelte';
  import ConditionFields from './ConditionFields.svelte';
  import JsonOnlyRow from './JsonOnlyRow.svelte';

  let { effect = $bindable() }: { effect: SavingThrowEffect } = $props();

  const KINDS: Record<SavingThrowEffect['kind'], string> = {
    bonus: 'Zuschlag', situational: 'Zuschlag in einer Lage', advantage: 'Vorteil',
  };

  // Übungsbonus und Attributsmodifikator tragen Merkmale, kein Gegenstand der Bibliothek.
  const editable = $derived(effect.kind !== 'bonus' || typeof effect.value === 'number');

  function setKind(kind: SavingThrowEffect['kind']) {
    const value = 'value' in effect && typeof effect.value === 'number' ? effect.value : 1;
    effect = savingThrowEffectSchema.parse(
      kind === 'advantage' ? { kind, abilities: effect.abilities }
      : kind === 'situational' ? { kind, value, condition: '', abilities: effect.abilities }
      : { kind, value, abilities: effect.abilities },
    );
  }
</script>

{#if editable}
  <span class="fx">
    <select class="edit-select" value={effect.kind} onchange={(e) => setKind((e.target as HTMLSelectElement).value as SavingThrowEffect['kind'])}>
      {#each Object.entries(KINDS) as [k, label]}<option value={k}>{label}</option>{/each}
    </select>
    {#if effect.kind === 'bonus' || effect.kind === 'situational'}
      <input class="edit-input num" type="number" bind:value={effect.value} />
    {/if}
    {#if effect.kind === 'advantage'}
      <label class="edit-check"><input type="checkbox" bind:checked={effect.deathSave} /> Todesrettungswürfe</label>
    {/if}
    {#if !(effect.kind === 'advantage' && effect.deathSave)}
      <AbilityChecks bind:selected={effect.abilities} hint="keins = alle" />
    {/if}
    {#if effect.kind !== 'bonus'}
      <ConditionFields bind:target={effect} />
    {/if}
  </span>
{:else}
  <JsonOnlyRow text={savingThrowEffectText(effect)} />
{/if}

<style>
  .fx { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .num { width: 4.5rem; }
</style>
