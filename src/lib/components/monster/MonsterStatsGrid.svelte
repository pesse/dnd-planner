<script lang="ts">
  import type { Monster } from '../../types';
  import { modStr } from '../../domain/skills';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../schemas/abilities';
  import './monsterEditForm.css';

  let { monster, onchange }: { monster: Monster; onchange: () => void } = $props();
</script>

<div class="stats-grid">
  {#each ABILITY_KEYS as key}
    <div class="stat-cell">
      <span class="stat-lbl">{ABILITY_ABBR_DE[key]}</span>
      <input class="ef stat-in" type="number" bind:value={monster.ability_scores[key]} oninput={onchange} />
      <span class="stat-mod">({modStr(monster.ability_scores[key])})</span>
    </div>
  {/each}
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    gap: 0.25rem;
  }

  .stat-cell { display: flex; flex-direction: column; align-items: center; gap: 0.05rem; }

  .stat-lbl {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-in { width: 46px; text-align: center; font-size: 1rem; font-weight: 600; padding: 0.1rem; }
  .stat-mod { font-size: 0.78rem; color: var(--ink-soft); }
</style>
