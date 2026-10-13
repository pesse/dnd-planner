<script lang="ts">
  import './wizard.css';
  import { ABILITY_LABEL } from '$lib/schemas/abilities';
  import type { AbilityKey, AbilityScores } from '../../services/wizard/pointBuy';
  import {
    allocatedTotal,
    isValidAllocation,
    suggestAsi,
    BACKGROUND_ASI_TOTAL,
    type AsiAllocation,
  } from '../../services/wizard/backgroundAsi';

  let { allowed, primary, scores, asi = $bindable() }: {
    allowed: AbilityKey[];
    /** Hauptattribute der Klasse — der Vorschlag legt +2 dorthin. */
    primary: AbilityKey[];
    scores: AbilityScores;
    asi: AsiAllocation;
  } = $props();

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
        <span>{ABILITY_LABEL[key]} <span class="score">({scores[key] + (asi[key] ?? 0)})</span>{#if primary.includes(key)} <span class="star" title="Hauptattribut">★</span>{/if}</span>
        <div class="chips">
          {#each [0, 1, 2] as v}
            <button class="chip" class:sel={(asi[key] ?? 0) === v} onclick={() => setAsi(key, v)}>+{v}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  <button class="secondary" onclick={() => (asi = suggestAsi(allowed, primary, scores))}>Vorschlag übernehmen</button>
  {#if !valid}<p class="warn">Ungültige Verteilung (erlaubt: +2/+1 oder +1/+1/+1).</p>{/if}
{/if}

<style>
  .asi { display: flex; flex-direction: column; gap: 0.4rem; max-width: 26rem; }
  .asi-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .score { color: var(--ink-muted); font-size: 0.85rem; }
  .star { color: var(--arcane, var(--gold)); }
</style>
