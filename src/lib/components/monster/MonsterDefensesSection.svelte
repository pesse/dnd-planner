<script lang="ts">
  import type { Monster } from '../../types';
  import { ABILITY_ABBR_DE, ABILITY_KEYS, type AbilityKey } from '../../schemas/abilities';
  import { CONDITIONS, DAMAGE_TYPES, SKILL_NAMES, type SkillName } from '../../schemas/vocabulary';
  import { DAMAGE_TYPE_LABELS } from '../../itemLabels';
  import { skillLabelDe } from '../../domain/skills';
  import VocabChips from './VocabChips.svelte';
  import './monsterEditForm.css';

  let { monster, onchange }: { monster: Monster; onchange: () => void } = $props();

  // Nur geübte Werte stehen in der Datei: ein leeres Feld löscht den Schlüssel, statt eine 0
  // zu speichern — sonst zeigt der Statblock „STÄ +0" als Übung an.
  function setNumber(record: Record<string, number>, key: string, raw: string) {
    if (raw.trim() === '') delete record[key];
    else record[key] = Number(raw);
    onchange();
  }

  const SKILL_OPTIONS = Object.fromEntries(SKILL_NAMES.map((s) => [s, skillLabelDe(s)])) as Record<SkillName, string>;
  const DAMAGE_OPTIONS = Object.fromEntries(DAMAGE_TYPES.map((t) => [t, DAMAGE_TYPE_LABELS[t]])) as Record<
    (typeof DAMAGE_TYPES)[number],
    string
  >;

  const chosenSkills = $derived(Object.keys(monster.skill_bonuses) as SkillName[]);
  const remainingSkills = $derived(SKILL_NAMES.filter((s) => !chosenSkills.includes(s)));

  function addSkill(skill: string) {
    if (!skill) return;
    monster.skill_bonuses[skill as SkillName] = 0;
    onchange();
  }
</script>

<div class="section">
  <div class="prop">
    <span class="lbl">Rettungswürfe</span>
    <div class="save-grid">
      {#each ABILITY_KEYS as key}
        <label class="save-cell">
          <span class="save-lbl">{ABILITY_ABBR_DE[key]}</span>
          <input
            class="ef num-sm"
            type="number"
            value={monster.saving_throws[key as AbilityKey] ?? ''}
            oninput={(e) => setNumber(monster.saving_throws, key, e.currentTarget.value)}
            placeholder="—"
          />
        </label>
      {/each}
    </div>
  </div>

  <div class="prop">
    <span class="lbl">Fertigkeiten</span>
    <div class="skill-list">
      {#each chosenSkills as skill}
        <span class="skill-pair">
          <span class="skill-name">{skillLabelDe(skill)}</span>
          <input
            class="ef num-sm"
            type="number"
            value={monster.skill_bonuses[skill] ?? 0}
            oninput={(e) => setNumber(monster.skill_bonuses, skill, e.currentTarget.value)}
          />
          <button class="kv-del" onclick={() => setNumber(monster.skill_bonuses, skill, '')}>×</button>
        </span>
      {/each}
      {#if remainingSkills.length}
        <select
          class="ef add-sel"
          value=""
          onchange={(e) => { addSkill(e.currentTarget.value); e.currentTarget.value = ''; }}
        >
          <option value="">+</option>
          {#each remainingSkills as skill}
            <option value={skill}>{SKILL_OPTIONS[skill]}</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  <VocabChips label="Anfälligkeiten" options={DAMAGE_OPTIONS} bind:selected={monster.damage_vulnerabilities} {onchange} />
  <VocabChips label="Resistenzen" options={DAMAGE_OPTIONS} bind:selected={monster.damage_resistances} {onchange} />
  <VocabChips label="Schadensimmunitäten" options={DAMAGE_OPTIONS} bind:selected={monster.damage_immunities} {onchange} />
  <VocabChips label="Zustandsimmunitäten" options={CONDITIONS} bind:selected={monster.condition_immunities} {onchange} />

  <div class="prop">
    <span class="lbl">Einschränkung</span>
    <input class="ef wide" bind:value={monster.defenses_desc} oninput={onchange}
      placeholder="z.B. nicht-magische Waffen" />
  </div>
</div>

<style>
  .save-grid { display: flex; flex-wrap: wrap; gap: 0.3rem; }

  .save-cell { display: flex; align-items: center; gap: 0.15rem; }

  .save-lbl {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    opacity: 0.75;
  }

  .skill-list { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }

  .skill-pair {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    font-size: 0.82rem;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 0.1rem 0 0.35rem;
  }

  .skill-name { white-space: nowrap; }

  .num-sm { width: 44px; text-align: center; font-size: 0.82rem; }

  .add-sel {
    font-size: 0.82rem;
    background: var(--bg-panel);
    cursor: pointer;
    width: 2.2rem;
  }
</style>
