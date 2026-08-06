<script lang="ts">
  import './sheet.css';
  import { sign } from '../../utils/num';
  import { MASTERY_INFO, masteryLabel } from '../../itemLabels';
  import { saveTip } from '../../services/characterSheetTips';
  import {
    armorProficiencyLabels,
    hasAnyProficiency,
    weaponProficiencyLabels,
  } from '../../domain/proficiencies';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../schemas/abilities';
  import type { WeaponMastery } from '../../schemas/vocabulary';
  import type { Character } from '../../schemas/characterSchema';

  let { character, masteryChips }: {
    character: Character;
    masteryChips: { name: string; mastery: WeaponMastery | undefined }[];
  } = $props();
</script>

<div class="section">
  <h3>Rettungswürfe</h3>
  <div class="save-list">
    {#each ABILITY_KEYS as key}
      {@const proficient = character.saveProfs[key]}
      {@const value = character.mods[key] + (proficient ? character.proficiencyBonus : 0)}
      <div class="save-row has-tip" class:proficient>
        <span class="prof-dot">{proficient ? '●' : '○'}</span>
        <span class="save-label">{ABILITY_ABBR_DE[key]}</span>
        <span class="save-val">{sign(value)}</span>
        <span class="tip tip-left">{@html saveTip(character, key, proficient)}</span>
      </div>
    {/each}
  </div>

  <h3>Sprachen</h3>
  <div class="tag-list">
    {#each character.languages as lang}<span class="tag">{lang}</span>{/each}
  </div>

  {#if character.tools.length}
    <h3>Werkzeuge</h3>
    <div class="tag-list">
      {#each character.tools as tool}<span class="tag">{tool}</span>{/each}
    </div>
  {/if}

  {#if character.proficiencies}
    {@const pf = character.proficiencies}
    {#if hasAnyProficiency(pf)}
      <h3>Übungen &amp; Rüstungsausbildung</h3>
      <div class="tag-list">
        {#each weaponProficiencyLabels(pf) as label}<span class="tag">{label}</span>{/each}
        {#each armorProficiencyLabels(pf) as label}<span class="tag">{label}</span>{/each}
      </div>
      {#if pf.otherWeapons && pf.otherWeapons.trim()}
        <p class="prof-extra"><strong>Sonstige Waffenübungen:</strong> {pf.otherWeapons}</p>
      {/if}
    {/if}
  {/if}

  <!-- Waffenbeherrschung: die Wahl selbst; die Eigenschaft kommt aus der
       Bibliothek, der Regeltext hängt im Tooltip. -->
  {#if masteryChips.length}
    <h3>Waffenbeherrschung</h3>
    <div class="tag-list">
      {#each masteryChips as chip}
        {#if chip.mastery}
          <span class="tag mastery-tag-full" title={MASTERY_INFO[chip.mastery].descDe}>
            {chip.name} <span class="mastery-prop">({masteryLabel(chip.mastery)})</span>
          </span>
        {:else}
          <span class="tag" title="Waffe nicht in der Bibliothek — Eigenschaft unbekannt">
            {chip.name} <span class="mastery-unknown">(?)</span>
          </span>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .save-list { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.75rem; }
  .save-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; }
  .save-row.proficient .save-val { color: var(--green); }
  .save-label { flex: 1; color: var(--ink-soft); }
  .save-val { font-weight: 600; }

  .prof-extra { font-size: 0.8rem; color: var(--ink-soft); margin: 0.2rem 0 0.4rem; }
  .mastery-tag-full { cursor: help; }
  .mastery-prop { color: var(--copper); }
  .mastery-unknown { color: var(--ink-muted); cursor: help; }
</style>
