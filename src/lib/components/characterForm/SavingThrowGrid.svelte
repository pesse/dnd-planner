<script lang="ts">
  /** Rettungswurf-Übungen mit ◆-Herkunftsmarker und dem daraus errechneten Wurf. */
  import { sign } from '../../utils/num';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import { ABILITY_ABBR_DE, ABILITY_KEYS, type AbilityFlags, type AbilityKey, type AbilityScores } from '../../schemas/abilities';
  import './form.css';

  let {
    saveProfs = $bindable(),
    mods, proficiencyBonus, sourceOf, dirOf,
  }: {
    saveProfs: AbilityFlags;
    mods: AbilityScores;
    proficiencyBonus: number;
    /** Herkunftslabels zum Attributs-Schlüssel; leer = kein Grant. */
    sourceOf: (key: AbilityKey) => string;
    dirOf: (field: AbilityKey, value: boolean) => DiffDir;
  } = $props();
</script>

<div class="save-checks">
  {#each ABILITY_KEYS as key}
    {@const source = sourceOf(key)}
    <label class="check-row" use:diffMark={dirOf(key, saveProfs[key])}>
      <input type="checkbox" checked={saveProfs[key]} onchange={(e) => (saveProfs[key] = e.currentTarget.checked)} />
      <span class="check-label">{ABILITY_ABBR_DE[key]}</span>
      {#if source}<span class="grant-mark" title={source}>◆</span>{/if}
      <span class="check-val">{sign(mods[key] + (saveProfs[key] ? proficiencyBonus : 0))}</span>
    </label>
  {/each}
</div>
