<script lang="ts">
  import type { Monster } from '../../types';
  import { monsterSizeLabel, monsterTypeLabel } from '../../types';
  import { modStr } from '../../domain/skills';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../schemas/abilities';
  // `.source-badge`/`.source-act` bleiben dort: der Klassenname wird gebaut, ein
  // scoped Selektor fände ihn nicht.
  import './monsterMiniCard.css';

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

<style>
  .compact {
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .c-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.3rem;
  }

  .c-name {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--danger);
    font-variant: small-caps;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .c-cr {
    font-size: 0.72rem;
    color: var(--gold);
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .c-meta {
    font-size: 0.75rem;
    color: var(--ink-muted);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .c-divider {
    height: 1px;
    background: color-mix(in srgb, var(--red) 33%, transparent);
    margin: 0.15rem 0;
  }

  .c-props {
    display: flex;
    gap: 0.5rem;
    font-size: 0.78rem;
    flex-wrap: wrap;
  }

  .c-lbl {
    font-weight: 700;
    color: var(--danger);
  }

  .c-stats {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    gap: 0.1rem;
  }

  .c-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.02rem;
  }

  .c-stat-lbl { font-size: 0.62rem; color: var(--danger); font-weight: 700; text-transform: uppercase; }
  .c-stat-val { font-size: 0.82rem; font-weight: 600; }
  .c-stat-mod { font-size: 0.65rem; color: var(--ink-soft); }

  .c-abilities {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .c-ability-name {
    font-size: 0.75rem;
    color: var(--ink-soft);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .c-action-row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    margin-top: 0.25rem;
    flex-wrap: wrap;
  }

  .edit-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .edit-btn:hover { border-color: var(--danger); color: var(--danger); }

  .promote-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.72rem;
  }
  .promote-btn:hover { border-color: var(--green); color: var(--green); }

  .promote-error {
    font-size: 0.72rem;
    color: var(--danger);
  }

  .schema-warning {
    background: color-mix(in srgb, var(--gold) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 33%, transparent);
    border-radius: 3px;
    padding: 0.3rem 0.4rem;
    font-size: 0.72rem;
  }
  .schema-warn-icon { font-weight: 700; color: var(--gold); }
  .schema-warn-list { margin: 0.2rem 0 0; padding-left: 1rem; color: color-mix(in srgb, var(--gold) 60%, transparent); line-height: 1.5; }
  .schema-warn-list li { margin: 0; }
</style>
