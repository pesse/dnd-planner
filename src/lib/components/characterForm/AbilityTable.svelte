<script lang="ts">
  /** Je Attribut eine Zeile: Wert, wirksamer Modifikator, Rettungswurf-Übung mit ◆-Herkunft. */
  import { sign } from '../../utils/num';
  import { mod } from '../../services/characterFormFields';
  import { attrModTip } from '../../services/characterSheetTips';
  import type { AbilityResolution } from '../../services/effectiveAbilities';
  import { ABILITY_ABBR_DE, ABILITY_KEYS, type AbilityFlags, type AbilityKey, type AbilityScores } from '../../schemas/abilities';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import { textTip } from '../textTip.svelte';
  import './form.css';

  let {
    abilities = $bindable(), saveProfs = $bindable(),
    resolved, mods, proficiencyBonus, saveSourceOf, scoreDirOf, saveDirOf,
  }: {
    abilities: AbilityScores;
    saveProfs: AbilityFlags;
    /** Wirksam, samt Gegenständen — der Mod hier ist DER, der überall rechnet. */
    resolved: Record<AbilityKey, AbilityResolution>;
    mods: AbilityScores;
    proficiencyBonus: number;
    /** Herkunftslabels zum Attributs-Schlüssel; leer = kein Grant. */
    saveSourceOf: (key: AbilityKey) => string;
    scoreDirOf: (key: AbilityKey, value: number) => DiffDir;
    saveDirOf: (key: AbilityKey, value: boolean) => DiffDir;
  } = $props();
</script>

<div class="ability-table">
  <span class="head"></span>
  <span class="head">Wert</span>
  <span class="head">Mod</span>
  <span class="head save-head">Rettungswurf</span>
  {#each ABILITY_KEYS as key}
    {@const source = saveSourceOf(key)}
    <span class="abbr">{ABILITY_ABBR_DE[key]}</span>
    <span use:diffMark={scoreDirOf(key, abilities[key])}>
      <input class="score" type="number" min="1" max="30" value={abilities[key]}
        oninput={(e) => (abilities[key] = Number(e.currentTarget.value))} />
    </span>
    <span class="mod has-tip">
      {sign(mod(resolved[key].score))}
      <span class="tip">{@html attrModTip(ABILITY_ABBR_DE[key], resolved[key])}</span>
    </span>
    <label class="save" use:diffMark={saveDirOf(key, saveProfs[key])}>
      <input type="checkbox" checked={saveProfs[key]} onchange={(e) => (saveProfs[key] = e.currentTarget.checked)} />
      <span class="save-val" class:proficient={saveProfs[key]}>{sign(mods[key] + (saveProfs[key] ? proficiencyBonus : 0))}</span>
      {#if source}<span class="grant-mark" use:textTip={source}>◆</span>{/if}
    </label>
  {/each}
</div>

<style>
  .ability-table {
    display: grid;
    grid-template-columns: 2.6rem 3.6rem 2.6rem auto;
    align-items: center;
    gap: 0.25rem 0.6rem;
    justify-content: start;
  }
  .head { font-size: 0.68rem; color: var(--ink-muted); }
  .abbr { font-size: 0.72rem; font-weight: 600; color: var(--ink-muted); letter-spacing: 0.05em; }
  .ability-table .score { width: 3.2rem; text-align: center; padding: 0.15rem; }
  .mod { font-size: 1.05rem; font-weight: 700; color: var(--arcane); text-align: center; }
  .save {
    display: flex; flex-direction: row; align-items: center; gap: 0.35rem;
    font-size: 0.82rem; color: var(--ink);
  }
  .save-val { font-weight: 600; min-width: 1.8rem; color: var(--ink-soft); }
  .save-val.proficient { color: var(--green); }
</style>
