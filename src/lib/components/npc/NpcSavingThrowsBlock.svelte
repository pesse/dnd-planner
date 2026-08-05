<script lang="ts">
  import { mod } from '../../domain/skills';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../schemas/abilities';
  import { sign } from '../../utils/num';
  import type { Npc, NpcStats } from '../../schemas/npc';
  import './npcCard.css';

  let { npc }: { npc: Npc } = $props();

  function toggleSaveProf(key: string) {
    const stored = npc.savingThrows[key];
    if (stored?.prof) {
      delete npc.savingThrows[key];
    } else {
      const base = mod(npc.stats[key as keyof NpcStats]);
      npc.savingThrows[key] = { bonus: base + 2, prof: true };
    }
  }
</script>

<div class="section">
  <h3>Rettungswürfe <span class="h3-hint">● = Klick zum Umschalten</span></h3>
  <div class="save-list">
    {#each ABILITY_KEYS as key}
      {@const stored = npc.savingThrows[key]}
      {@const base = mod(npc.stats[key])}
      {@const bonus = stored ? stored.bonus : base}
      {@const prof = stored?.prof ?? false}
      <div class="save-row" class:proficient={prof}>
        <button class="prof-dot" onclick={() => toggleSaveProf(key)} title="Profizenz umschalten">
          {prof ? '●' : '○'}
        </button>
        <span class="save-label">{ABILITY_ABBR_DE[key]}</span>
        <span class="save-val">{sign(bonus)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .save-list { display: flex; flex-direction: column; gap: 0.15rem; }

  .save-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
  }
  .save-row.proficient .save-val { color: var(--green); }

  .save-label { flex: 1; color: var(--ink-soft); }
  .save-val   { font-weight: 600; min-width: 2rem; text-align: right; }
</style>
