<script lang="ts">
  import type { Monster } from '../../types';
  import { monsterSizeLabel, monsterTypeLabel } from '../../types';
  import { modStr } from '../../domain/skills';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../schemas/abilities';

  let {
    monster,
    source,
    canEditLocally,
    schemaWarnings,
    promoteError,
    onedit,
    onpromote,
  }: {
    monster: Monster;
    source: 'global' | 'act';
    canEditLocally: boolean;
    schemaWarnings: string[];
    promoteError: string;
    onedit: () => void;
    onpromote: () => void;
  } = $props();
</script>

<div class="compact">
  <div class="c-header">
    <span class="c-name">{monster.name}</span>
    <span class="c-cr">HG {monster.cr}</span>
    <span class="source-badge source-{source}">{source === 'act' ? 'akt' : ''}</span>
  </div>
  <div class="c-meta">{monsterSizeLabel(monster.size)} {monsterTypeLabel(monster.type)}</div>

  <div class="c-divider"></div>

  <div class="c-props">
    <span><span class="c-lbl">RK</span> {monster.ac.value}</span>
    <span><span class="c-lbl">TP</span> {monster.hp.average}</span>
    <span><span class="c-lbl">BW</span> {monster.speed}</span>
  </div>

  <div class="c-stats">
    {#each ABILITY_KEYS as key}
      <div class="c-stat">
        <span class="c-stat-lbl">{ABILITY_ABBR_DE[key]}</span>
        <span class="c-stat-val">{monster.stats[key]}</span>
        <span class="c-stat-mod">{modStr(monster.stats[key])}</span>
      </div>
    {/each}
  </div>

  {#if monster.traits.length || monster.actions.length}
    <div class="c-divider"></div>
    <div class="c-abilities">
      {#each monster.traits as t}
        <span class="c-ability-name">{t.name}</span>
      {/each}
      {#each monster.actions as a}
        <span class="c-ability-name">{a.name}</span>
      {/each}
    </div>
  {/if}

  {#if schemaWarnings.length}
    <div class="schema-warning">
      <span class="schema-warn-icon">⚠ Schema-Fehler</span>
      <ul class="schema-warn-list">
        {#each schemaWarnings as w}<li>{w}</li>{/each}
      </ul>
    </div>
  {/if}

  <div class="c-action-row">
    <button class="edit-btn" onclick={onedit}>
      {source === 'global' && canEditLocally ? '✏ Lokal bearbeiten' : '✏ Bearbeiten'}
    </button>
    {#if source === 'act'}
      <button class="promote-btn" onclick={onpromote} title="In globale Bibliothek verschieben">→ Bibliothek</button>
    {/if}
  </div>
  {#if promoteError}<span class="promote-error">{promoteError}</span>{/if}
</div>
