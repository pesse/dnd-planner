<script lang="ts">
  /** Der letzte Wurf im Würfelkasten — in der Würfel-Box der SL und, wenn sie es teilt, im Spielerfenster. */
  import type { Snippet } from 'svelte';
  import Dice from '../ui/die/Dice.svelte';
  import type { Roll } from '../../services/battleMap/diceLog.svelte';

  let { roll, empty, size = 52, children }: { roll: Roll | undefined; empty: string; size?: number; children?: Snippet } = $props();

  const SOLIDS = [4, 6, 8, 10, 12, 20];
  /** Mehr Körper sind im Kasten nicht mehr zu lesen; dann zählt nur die Summe. */
  const MAX_SOLIDS = 20;

  const solid = $derived(roll && roll.dice.every((d) => SOLIDS.includes(d.sides)) && roll.dice.length <= MAX_SOLIDS);
</script>

<div class="stage" style="--size: {size}px">
  {#if roll}
    {#if solid}
      <Dice dice={roll.dice.map((d) => ({ ...d, dim: roll.kept != null && d.value !== roll.kept }))} roll={roll.id} {size} gap={4} />
    {/if}
    <span class="sum" class:hit={roll.crit === 'hit'} class:miss={roll.crit === 'miss'}>{roll.total}</span>
    <span class="what">{roll.label}</span>
  {:else}
    <span class="what">{empty}</span>
  {/if}
  {@render children?.()}
</div>

<style>
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    position: relative;
    min-height: calc(var(--size) * 2.3);
    padding: 0.3rem;
    text-align: center;
    border: 12px solid #5a3a1e;
    border-image: url('/branding/dice/tray.webp') 32 fill / 12px stretch;
  }
  .sum {
    font-family: var(--font-display);
    font-size: calc(var(--size) * 0.68);
    font-weight: 700;
    line-height: 1;
    color: #f6dc8c;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
  }
  .sum.hit {
    color: #9df0a0;
  }
  .sum.miss {
    color: #ff9c8a;
  }
  .what {
    font-size: calc(var(--size) * 0.22);
    color: rgba(246, 230, 190, 0.85);
    text-shadow: 0 1px 2px #000;
  }
</style>
