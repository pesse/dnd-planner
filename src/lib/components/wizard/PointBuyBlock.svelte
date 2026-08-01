<script lang="ts">
  import './wizard.css';
  import { ABILITY_LABEL } from '$lib/schemas/abilities';
  import {
    ABILITY_KEYS,
    STANDARD_ARRAY,
    POINT_BUY_BUDGET,
    remainingPoints,
    canAdjust,
    adjust,
    pointBuyStart,
    type AbilityKey,
    type AbilityScores,
  } from '../../services/wizard/pointBuy';

  let { scores = $bindable() }: { scores: AbilityScores } = $props();

  function bump(key: AbilityKey, delta: number) {
    if (canAdjust(scores, key, delta)) scores = adjust(scores, key, delta);
  }
  function useStandardArray() {
    const s = { ...pointBuyStart() };
    ABILITY_KEYS.forEach((k, i) => (s[k] = STANDARD_ARRAY[i]));
    scores = s;
  }
</script>

<p class="hint">Punktekauf: {POINT_BUY_BUDGET} Punkte, Werte 8–15. Verbleibend: <strong>{remainingPoints(scores)}</strong></p>
<div class="pointbuy">
  {#each ABILITY_KEYS as key}
    <div class="pb-row">
      <span class="pb-label">{ABILITY_LABEL[key]}</span>
      <button class="pb-btn" disabled={!canAdjust(scores, key, -1)} onclick={() => bump(key, -1)}>−</button>
      <span class="pb-val">{scores[key]}</span>
      <button class="pb-btn" disabled={!canAdjust(scores, key, 1)} onclick={() => bump(key, 1)}>+</button>
    </div>
  {/each}
</div>
<button class="secondary" onclick={useStandardArray}>Standard-Array (15,14,13,12,10,8)</button>

<style>
  .pointbuy { display: flex; flex-direction: column; gap: 0.4rem; }
  .pb-row { display: grid; grid-template-columns: 1fr auto 2.5rem auto; align-items: center; gap: 0.5rem; }
  .pb-label { color: var(--ink); }
  .pb-btn { width: 1.8rem; height: 1.8rem; border-radius: 5px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); cursor: pointer; font-size: 1rem; }
  .pb-btn:disabled { opacity: 0.4; cursor: default; }
  .pb-val { text-align: center; font-weight: 600; }
</style>
