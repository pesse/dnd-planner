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
      <input class="ef stat-in" type="number" bind:value={monster.stats[key]} oninput={onchange} />
      <span class="stat-mod">({modStr(monster.stats[key])})</span>
    </div>
  {/each}
</div>
