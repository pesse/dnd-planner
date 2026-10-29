<script lang="ts">
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
</script>

{#if overrides.length}
  <div class="overrides">
    <p class="auto-hint">
      Eingetragene Werte überschreiben die Rechnung und veralten still. Übernimm die Abweichung
      als Anpassung oder leere das Feld — gespeichert wird über die Speicherleiste.
    </p>
    {#each overrides as o (o.stat)}
      <div class="override" use:diffMark={dirOf(saved?.[o.stat], form[o.stat] ?? undefined)}>
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

<style>
  .overrides { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.6rem; }
  .override {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.6rem;
    font-size: 0.78rem; color: var(--ink-soft);
  }
  .ov-text { flex: 1; min-width: 12rem; }
  .ov-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .ov-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
  .ov-hint { flex-basis: 100%; font-size: 0.72rem; color: var(--copper); }
</style>
