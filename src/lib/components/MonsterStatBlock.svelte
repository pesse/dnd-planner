<script lang="ts">
  import type { Monster } from '../types';
  import { monsterSizeLabel, monsterTypeLabel, monsterAlignmentLabel } from '../types';
  import { modStr } from '../domain/skills';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../schemas/abilities';
  import {
    actionGroups, actionTitle, attackLine, conditionLine, crLabel, damageLine, languagesLine,
    savesLine, sensesLine, skillsLine, speedLine,
  } from '../services/monsterFormat';
  import Markdown from './Markdown.svelte';

  let { monster, count = 1, notes = '' }: { monster: Monster; count?: number; notes?: string } = $props();

  const saves = $derived(savesLine(monster));
  const skills = $derived(skillsLine(monster));
  const groups = $derived(actionGroups(monster));
</script>

<div class="stat-block">
  <div class="sb-name-row">
    <span class="sb-name">{count > 1 ? `${count}× ` : ''}{monster.name}</span>
    <span class="sb-cr">HG {crLabel(monster.challenge_rating)} ({monster.xp} EP)</span>
  </div>
  <div class="sb-type">{monsterSizeLabel(monster.size)}, {monsterTypeLabel(monster.type)}, {monsterAlignmentLabel(monster.alignment)}</div>

  <div class="sb-rule orange"></div>

  <div class="sb-prop"><span class="lbl">Rüstungsklasse</span> {monster.armor_class}{monster.armor_detail ? ` (${monster.armor_detail})` : ''}</div>
  <div class="sb-prop"><span class="lbl">Trefferpunkte</span> {monster.hit_points}{monster.hit_dice ? ` (${monster.hit_dice})` : ''}</div>
  <div class="sb-prop"><span class="lbl">Bewegungsrate</span> {speedLine(monster.speed)}</div>

  <div class="sb-rule orange"></div>

  <div class="sb-stats">
    {#each ABILITY_KEYS as key}
      <div class="sb-stat">
        <div class="sb-stat-lbl">{ABILITY_ABBR_DE[key]}</div>
        <div class="sb-stat-val">{monster.ability_scores[key]} ({modStr(monster.ability_scores[key])})</div>
      </div>
    {/each}
  </div>

  <div class="sb-rule orange"></div>

  {#if saves}
    <div class="sb-prop"><span class="lbl">Rettungswürfe</span> {saves}</div>
  {/if}
  {#if skills}
    <div class="sb-prop"><span class="lbl">Fertigkeiten</span> {skills}</div>
  {/if}
  {#if monster.damage_vulnerabilities.length}
    <div class="sb-prop"><span class="lbl">Schadensanfälligkeiten</span> {damageLine(monster.damage_vulnerabilities)}</div>
  {/if}
  {#if monster.damage_resistances.length}
    <div class="sb-prop"><span class="lbl">Schadensresistenzen</span> {damageLine(monster.damage_resistances)}</div>
  {/if}
  {#if monster.damage_immunities.length || monster.defenses_desc}
    <div class="sb-prop"><span class="lbl">Schadensimmunitäten</span> {damageLine(monster.damage_immunities, monster.defenses_desc)}</div>
  {/if}
  {#if monster.condition_immunities.length}
    <div class="sb-prop"><span class="lbl">Zustandsimmunitäten</span> {conditionLine(monster.condition_immunities)}</div>
  {/if}
  <div class="sb-prop"><span class="lbl">Sinne</span> {sensesLine(monster)}</div>
  <div class="sb-prop"><span class="lbl">Sprachen</span> {languagesLine(monster)}</div>

  {#if notes}
    <div class="sb-rule thin"></div>
    <div class="sb-prop sb-notes"><span class="lbl">DM-Notizen</span> <Markdown source={notes} inline /></div>
  {/if}

  {#if monster.traits.length}
    <div class="sb-rule orange"></div>
    {#each monster.traits as t}
      <div class="sb-action"><span class="sb-action-name">{t.name}.</span> <Markdown source={t.desc} inline /></div>
    {/each}
  {/if}

  {#each groups as group}
    <div class="sb-section-title">{group.label}</div>
    <div class="sb-rule thin"></div>
    {#each group.actions as a}
      <div class="sb-action">
        <span class="sb-action-name">{actionTitle(a)}.</span>
        <Markdown source={a.desc} inline />
        {#each a.attacks as attack}
          <div class="sb-attack">{attack.name}: {attackLine(attack)}</div>
        {/each}
      </div>
    {/each}
  {/each}
</div>

<style>
  .stat-block {
    background: var(--bg);
    border: 2px solid var(--gold);
    border-radius: 4px;
    padding: 0.6rem 0.75rem;
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    font-size: 0.82rem;
    color: var(--ink);
    break-inside: avoid;
    width: 100%;
    box-sizing: border-box;
  }

  .sb-name-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .sb-name {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--red);
    font-variant: small-caps;
  }

  .sb-cr {
    font-size: 0.78rem;
    color: var(--red);
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sb-type {
    font-style: italic;
    font-size: 0.78rem;
    color: var(--ink);
    margin-bottom: 0.2rem;
  }

  .sb-rule {
    height: 2px;
    margin: 0.3rem 0;
  }
  .sb-rule.orange { background: var(--gold); }
  .sb-rule.thin { height: 1px; background: color-mix(in srgb, var(--gold) 40%, transparent); }

  .sb-prop {
    margin: 0.1rem 0;
    line-height: 1.45;
  }

  .sb-notes {
    font-style: italic;
    color: var(--ink);
  }

  .lbl {
    font-weight: 700;
    color: var(--red);
  }

  .sb-stats {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    gap: 0.2rem;
    margin: 0.3rem 0;
  }

  .sb-stat { display: flex; flex-direction: column; gap: 0.05rem; }
  .sb-stat-lbl { font-size: 0.68rem; font-weight: 700; color: var(--red); text-transform: uppercase; }
  .sb-stat-val { font-size: 0.8rem; }

  .sb-section-title {
    font-size: 1rem;
    font-variant: small-caps;
    color: var(--red);
    font-weight: 700;
    margin-top: 0.4rem;
    margin-bottom: 0.1rem;
  }

  .sb-action {
    margin: 0.25rem 0;
    line-height: 1.5;
  }

  .sb-action-name {
    font-weight: 700;
    font-style: italic;
  }

  .sb-attack {
    padding-left: 0.9rem;
    font-size: 0.78rem;
  }
</style>
