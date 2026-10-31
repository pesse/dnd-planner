<script lang="ts">
  import { ATTACK_WEAPON_RANGES, attackEffectSchema, type AttackEffect } from '$lib/schemas/attackEffect';
  import { DAMAGE_TYPES, type DamageType } from '$lib/schemas/vocabulary';
  import { DAMAGE_TYPE_LABELS } from '$lib/itemLabels';
  import { attackEffectText } from '$lib/services/itemDeclarations';
  import ConditionFields from './ConditionFields.svelte';
  import JsonOnlyRow from './JsonOnlyRow.svelte';

  let { effect = $bindable() }: { effect: AttackEffect } = $props();

  const KINDS: Record<AttackEffect['kind'], string> = {
    bonus: 'Zuschlag', situational: 'Zuschlag in einer Lage', dice: 'Zusatzwürfel', note: 'Hinweis',
  };
  const RANGE_DE: Record<(typeof ATTACK_WEAPON_RANGES)[number], string> = {
    any: 'alle Waffen', melee: 'Nahkampfwaffen', ranged: 'Fernkampfwaffen',
  };

  // Würfel nach Stufe und der Übungsbonus kommen an Gegenständen nicht vor.
  const editable = $derived(
    !(effect.kind === 'dice' && typeof effect.dice !== 'string')
    && !(effect.kind === 'situational' && effect.value === 'proficiency-bonus'),
  );
  // Die übrigen Filter bleiben erhalten, das Formular zeigt sie nur an.
  const listFilters = $derived(!!(effect.weapons?.length || effect.properties?.length || effect.damageTypes?.length));

  function setKind(kind: AttackEffect['kind']) {
    const { range, weapons, properties, damageTypes, spellAttacks, self } = effect;
    const filter = { range, weapons, properties, damageTypes, spellAttacks, self };
    const condition = 'condition' in effect ? { condition: effect.condition, conditionDe: effect.conditionDe } : { condition: '' };
    effect = attackEffectSchema.parse(
      kind === 'bonus' ? { kind, attack: 1, ...filter }
      : kind === 'situational' ? { kind, roll: 'damage', value: 1, ...condition, ...filter }
      : kind === 'dice' ? { kind, dice: '1d6', ...condition, ...filter }
      : { kind, ...condition, ...filter },
    );
  }

  function setDamageType(raw: string) {
    if (effect.kind === 'dice') effect.damageType = raw ? (raw as DamageType) : undefined;
  }
</script>

{#if editable}
  <span class="fx">
    <select class="edit-select" value={effect.kind} onchange={(e) => setKind((e.target as HTMLSelectElement).value as AttackEffect['kind'])}>
      {#each Object.entries(KINDS) as [k, label]}<option value={k}>{label}</option>{/each}
    </select>
    {#if effect.kind === 'bonus'}
      <label class="edit-check">Angriff <input class="edit-input num" type="number" bind:value={effect.attack} /></label>
      <label class="edit-check">Schaden <input class="edit-input num" type="number" bind:value={effect.damage} /></label>
    {:else if effect.kind === 'situational'}
      <select class="edit-select" bind:value={effect.roll}>
        <option value="attack">Angriff</option>
        <option value="damage">Schaden</option>
      </select>
      <input class="edit-input num" type="number" bind:value={effect.value} />
    {:else if effect.kind === 'dice' && typeof effect.dice === 'string'}
      <input class="edit-input num" placeholder="1d6" bind:value={effect.dice} />
      <select class="edit-select" value={effect.damageType ?? ''} onchange={(e) => setDamageType((e.target as HTMLSelectElement).value)}>
        <option value="">Schadensart der Waffe</option>
        {#each DAMAGE_TYPES as t}<option value={t}>{DAMAGE_TYPE_LABELS[t]}</option>{/each}
      </select>
    {/if}
    <label class="edit-check"><input type="checkbox" bind:checked={effect.self} /> nur diese Waffe</label>
    {#if !effect.self}
      <select class="edit-select" bind:value={effect.range}>
        {#each ATTACK_WEAPON_RANGES as r}<option value={r}>{RANGE_DE[r]}</option>{/each}
      </select>
      {#if listFilters}<span class="hint">{attackEffectText(effect)}</span>{/if}
    {/if}
    {#if effect.kind !== 'bonus'}
      <ConditionFields bind:target={effect} />
    {/if}
  </span>
{:else}
  <JsonOnlyRow text={attackEffectText(effect)} />
{/if}

<style>
  .fx { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .num { width: 4.5rem; }
  .hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }
</style>
