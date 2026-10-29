<script lang="ts">
  import { COMBAT_STATS, type CombatAdjustment, type CombatStat } from '../../schemas/combatAdjustment';
  import {
    COMBAT_STAT_LABEL_DE, adoptOverride, clearOverride, deltaLabel, type CombatOverride,
  } from '../../services/combatOverrides';
  import type { CharacterFormFields } from '../../services/characterFormFields';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
  import './form.css';

  let { form, overrides, saved, dirOf }: {
    form: CharacterFormFields;
    overrides: CombatOverride[];
    saved?: Character | null;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  let adding = $state<CombatStat>('ac');

  const rows = $derived(COMBAT_STATS.flatMap((stat) => form.combatAdjustments[stat].map((adj) => ({ stat, adj }))));

  function remove(stat: CombatStat, adj: CombatAdjustment) {
    const list = form.combatAdjustments[stat];
    list.splice(list.indexOf(adj), 1);
  }
</script>

{#if overrides.length}
  <div class="overrides">
    <p class="auto-hint">
      Eingetragene Werte überschreiben die Rechnung und veralten still. Übernimm die Abweichung
      als Anpassung oder leere das Feld — gespeichert wird über die Speicherleiste.
    </p>
    {#each overrides as o (o.stat)}
      <div class="override" use:diffMark={dirOf(saved?.[o.stat], form[o.stat])}>
        <span class="ov-text">
          <strong>{COMBAT_STAT_LABEL_DE[o.stat]}</strong>
          eingetragen {o.stored} · gerechnet {o.computed ?? '—'}
        </span>
        <span class="ov-actions">
          {#if o.delta}
            <button type="button" class="btn-link-all" onclick={() => adoptOverride(form, o)}>
              als Anpassung {deltaLabel(o)} übernehmen
            </button>
          {/if}
          <button type="button" class="btn-link-all" disabled={o.computed === null}
            onclick={() => clearOverride(form, o)}>
            {o.delta === 0 ? 'Feld leeren (gleicher Wert)' : 'Feld leeren, gerechneter Wert gilt'}
          </button>
        </span>
        {#each o.hints as hint}<span class="ov-hint">⚠ {hint}</span>{/each}
      </div>
    {/each}
  </div>
{/if}

<div class="adjustments" use:diffMark={dirOf(saved?.combatAdjustments, rows.length ? $state.snapshot(form.combatAdjustments) : undefined)}>
  {#each rows as { stat, adj }}
    <div class="adj-row">
      <span class="adj-stat">{COMBAT_STAT_LABEL_DE[stat]}</span>
      <input class="adj-amount" type="number" step={stat === 'speed' ? 5 : 1} bind:value={adj.amount}
        title={stat === 'speed' ? 'Zu- oder Abschlag in Fuß' : 'Zu- oder Abschlag'} />
      {#if stat === 'speed'}<span class="adj-unit">Fuß</span>{/if}
      <input class="adj-reason" bind:value={adj.reason} placeholder="Anlass, z. B. Segen des Spielleiters" />
      <button type="button" class="adj-remove" title="Anpassung entfernen" onclick={() => remove(stat, adj)}>✕</button>
    </div>
  {/each}
  <div class="adj-row">
    <select bind:value={adding} title="Welcher Wert">
      {#each COMBAT_STATS as stat}<option value={stat}>{COMBAT_STAT_LABEL_DE[stat]}</option>{/each}
    </select>
    <button type="button" class="adj-add"
      onclick={() => form.combatAdjustments[adding].push({ amount: adding === 'speed' ? 5 : 1, reason: '' })}>
      ± Anpassung
    </button>
  </div>
</div>

<style>
  .overrides, .adjustments { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.6rem; }
  .override {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.6rem;
    font-size: 0.78rem; color: var(--ink-soft);
  }
  .ov-text { flex: 1; min-width: 12rem; }
  .ov-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .ov-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
  .ov-hint { flex-basis: 100%; font-size: 0.72rem; color: var(--copper); }
  .adj-row { display: flex; align-items: center; gap: 0.3rem; }
  .adj-row input, .adj-row select { font-size: 0.75rem; padding: 0.1rem 0.25rem; }
  .adj-stat { width: 6rem; font-size: 0.75rem; color: var(--ink-muted); }
  .adj-amount { width: 3.6rem; text-align: center; }
  .adj-unit { font-size: 0.7rem; color: var(--ink-muted); }
  .adj-reason { flex: 1; min-width: 6rem; }
  .adj-add, .adj-remove {
    background: none; border: none; cursor: pointer; padding: 0;
    font-size: 0.7rem; color: var(--ink-muted);
  }
  .adj-add:hover, .adj-remove:hover { color: var(--arcane); }
</style>
