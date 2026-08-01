<script lang="ts">
  import './wizard.css';
  import { ABILITY_LABEL } from '$lib/schemas/abilities';
  import type { AbilityKey } from '../../services/wizard/pointBuy';
  import {
    allocatedTotal,
    isValidAllocation,
    BACKGROUND_ASI_TOTAL,
    type AsiAllocation,
  } from '../../services/wizard/backgroundAsi';

  let { allowed, asi = $bindable() }: { allowed: AbilityKey[]; asi: AsiAllocation } = $props();

  const valid = $derived(allowed.length === 0 || isValidAllocation(asi, allowed));

  function setAsi(key: AbilityKey, value: number) {
    asi = { ...asi, [key]: value };
  }
</script>

{#if allowed.length === 0}
  <p class="hint">Dieser Hintergrund liefert keine (auflösbaren) Attributserhöhungen.</p>
{:else}
  <p class="hint">Verteile den Hintergrunds-Bonus: +2/+1 auf zwei oder +1/+1/+1 auf drei Attribute. Verbleibend: <strong>{BACKGROUND_ASI_TOTAL - allocatedTotal(asi)}</strong></p>
  <div class="asi">
    {#each allowed as key}
      <div class="asi-row">
        <span>{ABILITY_LABEL[key]}</span>
        <div class="chips">
          {#each [0, 1, 2] as v}
            <button class="chip" class:sel={(asi[key] ?? 0) === v} onclick={() => setAsi(key, v)}>+{v}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  {#if !valid}<p class="warn">Ungültige Verteilung (erlaubt: +2/+1 oder +1/+1/+1).</p>{/if}
{/if}

<style>
  .asi-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
</style>
