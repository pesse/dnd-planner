<script lang="ts">
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../schemas/abilities';
  import { mod, modStr } from '../../domain/skills';
  import type { Npc } from '../../schemas/npc';

  let { npc }: { npc: Npc } = $props();
</script>

<div class="section attributes">
  {#each ABILITY_KEYS as attr}
    <div class="attr-box">
      <div class="attr-label">{ABILITY_ABBR_DE[attr]}</div>
      <div class="attr-mod">{modStr(npc.stats[attr])}</div>
      <input class="attr-score" type="number" bind:value={npc.stats[attr]} />
    </div>
  {/each}
</div>

<style>
  .attributes {
    display: flex;
    gap: 0.5rem;
  }

  .attr-box {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    min-width: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }

  .attr-label { font-size: 0.65rem; color: var(--ink-muted); text-transform: uppercase; }
  .attr-mod   { font-size: 1.15rem; font-weight: 700; color: var(--arcane); line-height: 1.2; }
  .attr-score {
    width: 2.5rem;
    background: none;
    border: none;
    border-top: 1px solid var(--border);
    color: var(--ink-soft);
    font-size: 0.75rem;
    font-family: inherit;
    text-align: center;
    outline: none;
    padding: 0.1rem 0 0;
  }
  .attr-score:focus { border-top-color: var(--red); }
</style>
