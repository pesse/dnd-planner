<script lang="ts">
  /** Die sechs Attributs-Kästchen mit dem Modifikator darüber. */
  import { sign } from '../../utils/num';
  import { mod } from '../../services/characterFormFields';
  import { attrModTip } from '../../services/characterSheetTips';
  import type { AbilityResolution } from '../../services/effectiveAbilities';
  import { ABILITY_ABBR_DE, ABILITY_KEYS, type AbilityKey, type AbilityScores } from '../../schemas/abilities';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import './form.css';

  let {
    abilities = $bindable(),
    resolved,
    dirOf,
  }: {
    abilities: AbilityScores;
    /** Wirksam, samt Gegenständen — der Mod darüber ist DER, der überall rechnet. */
    resolved: Record<AbilityKey, AbilityResolution>;
    dirOf: (key: AbilityKey, value: number) => DiffDir;
  } = $props();
</script>

<div class="attr-row">
  {#each ABILITY_KEYS as key}
    <div class="attr-box" use:diffMark={dirOf(key, abilities[key])}>
      <span class="attr-mod-display has-tip">
        {sign(mod(resolved[key].score))}
        <span class="tip">{@html attrModTip(ABILITY_ABBR_DE[key], resolved[key])}</span>
      </span>
      <span class="attr-label">{ABILITY_ABBR_DE[key]}</span>
      <input
        class="attr-input"
        type="number"
        min="1" max="30"
        value={abilities[key]}
        oninput={(e) => (abilities[key] = Number(e.currentTarget.value))}
      />
    </div>
  {/each}
</div>
