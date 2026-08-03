<script lang="ts">
  import './wizard.css';
  import {
    skillLabelDe,
    abilityLabelDe,
    WEAPON_LABEL_DE,
    ARMOR_LABEL_DE,
    type CollectedGrants,
  } from '../../services/proficiencyGrants';
  import { SKILL_NAMES, type SkillName } from '../../schemas/vocabulary';

  let { grants, picks = $bindable(), onchange }: {
    grants: CollectedGrants | null;
    picks: string[][];
    onchange: () => void;
  } = $props();

  function allowedSkillsFor(from: SkillName[]): readonly SkillName[] {
    return from.length ? from : SKILL_NAMES;
  }

  function toggle(choiceIdx: number, skill: string, max: number) {
    const cur = picks[choiceIdx] ?? [];
    let next: string[];
    if (cur.includes(skill)) next = cur.filter((s) => s !== skill);
    else if (cur.length >= max) return;
    else next = [...cur, skill];
    picks = picks.map((p, i) => (i === choiceIdx ? next : p));
    onchange();
  }
</script>

{#if !grants}
  <p class="hint">Lade Übungen …</p>
{:else}
  <div class="grants">
    {#if grants.skills.length}
      <p><strong>Fertigkeiten:</strong> {grants.skills.map((g) => skillLabelDe(g.value)).join(', ')}</p>
    {/if}
    {#if grants.savingThrows.length}
      <p><strong>Rettungswürfe:</strong> {grants.savingThrows.map((g) => abilityLabelDe(g.value)).join(', ')}</p>
    {/if}
    {#if grants.weapons.length}
      <p><strong>Waffen:</strong> {grants.weapons.map((g) => WEAPON_LABEL_DE[g.value]).join(', ')}</p>
    {/if}
    {#if grants.armor.length}
      <p><strong>Rüstung:</strong> {grants.armor.map((g) => ARMOR_LABEL_DE[g.value]).join(', ')}</p>
    {/if}
  </div>
  {#each grants.choices as choice, ci}
    <div class="field">
      <span>{choice.source.label}: wähle {choice.choose}</span>
      <div class="chips">
        {#each allowedSkillsFor(choice.from) as skill}
          <button
            class="chip"
            class:sel={(picks[ci] ?? []).includes(skill)}
            onclick={() => toggle(ci, skill, choice.choose)}
          >{skillLabelDe(skill)}</button>
        {/each}
      </div>
    </div>
  {/each}
{/if}

<style>
  .grants p { margin: 0.2rem 0; font-size: 0.88rem; }
</style>
