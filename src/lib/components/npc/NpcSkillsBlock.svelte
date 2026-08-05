<script lang="ts">
  import { SKILL_DEFS, mod } from '../../domain/skills';
  import { sign } from '../../utils/num';
  import type { Npc } from '../../schemas/npc';
  import './npcCard.css';

  let { npc }: { npc: Npc } = $props();

  function toggleSkillProf(key: string) {
    const stored = npc.skills[key];
    if (stored?.prof) {
      delete npc.skills[key];
    } else {
      const skillDef = SKILL_DEFS.find(s => s.key === key);
      const statKey = skillDef ? skillDef.attr : 'str';
      const base = mod(npc.stats[statKey]);
      npc.skills[key] = { bonus: base + 2, prof: true };
    }
  }
</script>

<div class="section">
  <h3>Fertigkeiten <span class="h3-hint">● = Klick zum Umschalten</span></h3>
  <div class="skill-grid">
    {#each SKILL_DEFS as def}
      {@const stored = npc.skills[def.key]}
      {@const statKey = def.attr}
      {@const base = mod(npc.stats[statKey])}
      {@const bonus = stored ? stored.bonus : base}
      {@const prof = stored?.prof ?? false}
      <div class="skill-row" class:proficient={prof}>
        <button class="prof-dot" onclick={() => toggleSkillProf(def.key)} title="Profizenz umschalten">
          {prof ? '●' : '○'}
        </button>
        <span class="skill-name">{def.key}</span>
        <span class="skill-val">{sign(bonus)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 0.5rem;
    margin-bottom: 0.4rem;
  }

  .skill-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .skill-row.proficient .skill-val { color: var(--green); }

  .skill-name { flex: 1; color: var(--ink-soft); }
  .skill-val  { font-weight: 600; min-width: 2rem; text-align: right; }
</style>
