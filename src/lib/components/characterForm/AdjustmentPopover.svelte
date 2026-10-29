<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { CombatAdjustment, CombatStat } from '../../schemas/combatAdjustment';
  import './form.css';

  let { stat, list, onclose, children }: {
    stat: CombatStat;
    list: CombatAdjustment[];
    onclose: () => void;
    /** Was außer den Anpassungen in den Wert eingeht (beim TP-Maximum die Würfelsumme). */
    children?: Snippet;
  } = $props();

  let root: HTMLDivElement;
  const feet = $derived(stat === 'speed');

  function onWindowClick(e: MouseEvent) {
    if (!root.parentElement?.contains(e.target as Node)) onclose();
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="adj-pop" bind:this={root}>
  {@render children?.()}
  {#each list as adj, i}
    <div class="adj-row">
      <input class="adj-amount" type="number" step={feet ? 5 : 1} bind:value={adj.amount}
        title={feet ? 'Zu- oder Abschlag in Fuß' : 'Zu- oder Abschlag'} />
      {#if feet}<span class="adj-unit">Fuß</span>{/if}
      <input class="adj-reason" bind:value={adj.reason} placeholder="Anlass, z. B. Segen" />
      <button type="button" class="adj-btn" title="Anpassung entfernen" onclick={() => list.splice(i, 1)}>✕</button>
    </div>
  {/each}
  <button type="button" class="adj-btn adj-add" onclick={() => list.push({ amount: feet ? 5 : 1, reason: '' })}>
    + Anpassung
  </button>
</div>

<style>
  .adj-pop {
    position: absolute; top: calc(100% + 0.2rem); left: 0; z-index: 20;
    display: flex; flex-direction: column; gap: 0.3rem;
    width: 17rem; padding: 0.45rem;
    background: var(--bg); border: 1px solid var(--border-strong); border-radius: 6px;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
    text-align: left;
  }
  .adj-row { display: flex; align-items: center; gap: 0.3rem; }
  .adj-row input { font-size: 0.75rem; padding: 0.1rem 0.25rem; }
  .adj-amount { width: 3.4rem; text-align: center; }
  .adj-unit { font-size: 0.7rem; color: var(--ink-muted); }
  .adj-reason { flex: 1; min-width: 0; }
  .adj-btn {
    background: none; border: none; cursor: pointer; padding: 0;
    font-size: 0.72rem; color: var(--ink-muted);
  }
  .adj-btn:hover { color: var(--arcane); }
  .adj-add { align-self: flex-start; }
</style>
