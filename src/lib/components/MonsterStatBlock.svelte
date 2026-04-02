<script lang="ts">
  import type { Monster } from '../types';
  import { monsterSizeLabel, monsterTypeLabel, monsterAlignmentLabel } from '../types';

  let { monster, count = 1, notes = '' }: { monster: Monster; count?: number; notes?: string } = $props();

  function mod(n: number): string {
    const m = Math.floor((n - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const STAT_LABELS = ['STR', 'DEX', 'KON', 'INT', 'WEI', 'CHA'];
</script>

<div class="stat-block">
  <div class="sb-name-row">
    <span class="sb-name">{count > 1 ? `${count}× ` : ''}{monster.name}</span>
    <span class="sb-cr">HG {monster.cr} ({monster.xp} EP)</span>
  </div>
  <div class="sb-type">{monsterSizeLabel(monster.size)}, {monsterTypeLabel(monster.type)}, {monsterAlignmentLabel(monster.alignment)}</div>

  <div class="sb-rule orange"></div>

  <div class="sb-prop"><span class="lbl">Rüstungsklasse</span> {monster.ac.value}{monster.ac.note ? ` (${monster.ac.note})` : ''}</div>
  <div class="sb-prop"><span class="lbl">Trefferpunkte</span> {monster.hp.average} ({monster.hp.formula})</div>
  <div class="sb-prop"><span class="lbl">Bewegungsrate</span> {monster.speed}</div>

  <div class="sb-rule orange"></div>

  <div class="sb-stats">
    {#each STAT_KEYS as key, i}
      <div class="sb-stat">
        <div class="sb-stat-lbl">{STAT_LABELS[i]}</div>
        <div class="sb-stat-val">{monster.stats[key]} ({mod(monster.stats[key])})</div>
      </div>
    {/each}
  </div>

  <div class="sb-rule orange"></div>

  {#if Object.keys(monster.saving_throws ?? {}).length}
    <div class="sb-prop"><span class="lbl">Rettungswürfe</span> {Object.entries(monster.saving_throws).map(([k, v]) => `${k} ${v}`).join(', ')}</div>
  {/if}
  {#if Object.keys(monster.skills ?? {}).length}
    <div class="sb-prop"><span class="lbl">Fertigkeiten</span> {Object.entries(monster.skills).map(([k, v]) => `${k} ${v}`).join(', ')}</div>
  {/if}
  {#if monster.damage_resistances?.length}
    <div class="sb-prop"><span class="lbl">Schadensresistenzen</span> {monster.damage_resistances.join(', ')}</div>
  {/if}
  {#if monster.damage_immunities?.length}
    <div class="sb-prop"><span class="lbl">Schadensimmunitäten</span> {monster.damage_immunities.join(', ')}</div>
  {/if}
  {#if monster.condition_immunities?.length}
    <div class="sb-prop"><span class="lbl">Zustandsimmunitäten</span> {monster.condition_immunities.join(', ')}</div>
  {/if}
  <div class="sb-prop"><span class="lbl">Sinne</span> {monster.senses}</div>
  <div class="sb-prop"><span class="lbl">Sprachen</span> {monster.languages}</div>

  {#if notes}
    <div class="sb-rule thin"></div>
    <div class="sb-prop sb-notes"><span class="lbl">DM-Notizen</span> {notes}</div>
  {/if}

  {#if monster.traits?.length}
    <div class="sb-rule orange"></div>
    {#each monster.traits as t}
      <div class="sb-action"><span class="sb-action-name">{t.name}.</span> {t.description}</div>
    {/each}
  {/if}

  {#if monster.actions?.length}
    <div class="sb-section-title">Aktionen</div>
    <div class="sb-rule thin"></div>
    {#each monster.actions as a}
      <div class="sb-action">
        <span class="sb-action-name">{a.name}.</span>
        {#if a.attack_bonus !== undefined} Angriffswurf: +{a.attack_bonus}.{/if}
        {#if a.damage} Schaden: {a.damage}.{/if}
        {a.description}
      </div>
    {/each}
  {/if}

  {#if monster.reactions?.length}
    <div class="sb-section-title">Reaktionen</div>
    <div class="sb-rule thin"></div>
    {#each monster.reactions as r}
      <div class="sb-action"><span class="sb-action-name">{r.name}.</span> {r.description}</div>
    {/each}
  {/if}

  {#if monster.legendary_actions?.length}
    <div class="sb-section-title">Legendäre Aktionen</div>
    <div class="sb-rule thin"></div>
    {#each monster.legendary_actions as la}
      <div class="sb-action"><span class="sb-action-name">{la.name}.</span> {la.description}</div>
    {/each}
  {/if}
</div>

<style>
  .stat-block {
    background: #fdf1dc;
    border: 2px solid #8c6a1a;
    border-radius: 4px;
    padding: 0.6rem 0.75rem;
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    font-size: 0.82rem;
    color: #1a1008;
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
    color: #5c1a00;
    font-variant: small-caps;
  }

  .sb-cr {
    font-size: 0.78rem;
    color: #5c1a00;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sb-type {
    font-style: italic;
    font-size: 0.78rem;
    color: #3a2000;
    margin-bottom: 0.2rem;
  }

  .sb-rule {
    height: 2px;
    margin: 0.3rem 0;
  }
  .sb-rule.orange { background: #8c6a1a; }
  .sb-rule.thin { height: 1px; background: #8c6a1a66; }

  .sb-prop {
    margin: 0.1rem 0;
    line-height: 1.45;
  }

  .sb-notes {
    font-style: italic;
    color: #3a2000;
  }

  .lbl {
    font-weight: 700;
    color: #5c1a00;
  }

  .sb-stats {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    gap: 0.2rem;
    margin: 0.3rem 0;
  }

  .sb-stat { display: flex; flex-direction: column; gap: 0.05rem; }
  .sb-stat-lbl { font-size: 0.68rem; font-weight: 700; color: #5c1a00; text-transform: uppercase; }
  .sb-stat-val { font-size: 0.8rem; }

  .sb-section-title {
    font-size: 1rem;
    font-variant: small-caps;
    color: #5c1a00;
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
</style>
