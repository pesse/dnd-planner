<script lang="ts">
  /**
   * Editor der geschlossenen Übungs-Vokabulare, von allen vier Bibliotheks-Editoren
   * benutzt. `scope="skills"` blendet alles außer Fertigkeiten und Werkzeugen aus, weil
   * Hintergrund, Merkmal und Talent im SRD 5.2 nur diese beiden gewähren.
   */
  import { ABILITY_NAMES } from '$lib/schemas/abilities';
  import { ARMOR_TRAININGS, WEAPON_CATEGORIES } from '$lib/schemas/vocabulary';
  import type { AbilityName } from '$lib/schemas/abilities';
  import type { ArmorTraining, WeaponCategory } from '$lib/schemas/vocabulary';
  import type { ProficiencyGrant } from '$lib/schemas/grants';
  import { abilityLabelDe, ARMOR_LABEL_DE, WEAPON_LABEL_DE } from '$lib/services/proficiencyGrants';
  import SkillGrantEditForm from './SkillGrantEditForm.svelte';

  let {
    grant = $bindable<ProficiencyGrant>(),
    scope = 'full',
    onchange = () => void 0,
  }: {
    grant: ProficiencyGrant;
    scope?: 'full' | 'skills';
    onchange?: () => void;
  } = $props();

  function toggleSave(value: AbilityName, checked: boolean) {
    grant.savingThrows = checked ? [...grant.savingThrows, value] : grant.savingThrows.filter((v) => v !== value);
    onchange();
  }

  function toggleWeapon(value: WeaponCategory, checked: boolean) {
    grant.weapons = checked ? [...grant.weapons, value] : grant.weapons.filter((v) => v !== value);
    onchange();
  }

  function toggleArmor(value: ArmorTraining, checked: boolean) {
    grant.armor = checked ? [...grant.armor, value] : grant.armor.filter((v) => v !== value);
    onchange();
  }

  // Englischer Freitext („Martial weapons that have the Light property"), eine Zeile
  // mit Semikolon getrennt.
  let otherText = $state(grant.weaponsOther.join('; '));

  function onOtherInput() {
    grant.weaponsOther = otherText.split(';').map((s) => s.trim()).filter(Boolean);
    onchange();
  }

  // DEUTSCH, anders als die Waffenzeile darunter: der Wert steht so auf dem Bogen.
  let toolsText = $state(grant.tools.join('; '));

  function onToolsInput() {
    grant.tools = toolsText.split(';').map((s) => s.trim()).filter(Boolean);
    onchange();
  }
</script>

<div class="grant-block">
  <div class="sub-title">Fertigkeiten</div>
  <SkillGrantEditForm bind:grant={grant.skills} {onchange} />

  <label class="lbl-block">Werkzeuge (DE, Semikolon-getrennt)
    <input class="ef" bind:value={toolsText} oninput={onToolsInput} placeholder="z.B. Schmiedewerkzeug; Laute" />
  </label>

  {#if scope === 'full'}
    <div class="sub-title">Rettungswürfe</div>
    <div class="flag-grid six">
      {#each ABILITY_NAMES as ability}
        <label class="chk">
          <input
            type="checkbox"
            checked={grant.savingThrows.includes(ability)}
            onchange={(e) => toggleSave(ability, (e.target as HTMLInputElement).checked)}
          />
          {abilityLabelDe(ability)}
        </label>
      {/each}
    </div>

    <div class="sub-title">Waffen</div>
    <div class="flag-grid two">
      {#each WEAPON_CATEGORIES as category}
        <label class="chk">
          <input
            type="checkbox"
            checked={grant.weapons.includes(category)}
            onchange={(e) => toggleWeapon(category, (e.target as HTMLInputElement).checked)}
          />
          {WEAPON_LABEL_DE[category]}
        </label>
      {/each}
    </div>
    <label class="lbl-block">Weitere Waffen (EN, Semikolon-getrennt)
      <input class="ef" bind:value={otherText} oninput={onOtherInput} placeholder="z.B. Martial weapons that have the Light property" />
    </label>

    <div class="sub-title">Rüstung</div>
    <div class="flag-grid four">
      {#each ARMOR_TRAININGS as training}
        <label class="chk">
          <input
            type="checkbox"
            checked={grant.armor.includes(training)}
            onchange={(e) => toggleArmor(training, (e.target as HTMLInputElement).checked)}
          />
          {ARMOR_LABEL_DE[training]}
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ef { width: 100%; }

  .grant-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .sub-title {
    font-size: 0.78rem; font-weight: 700; color: var(--ink-soft);
    text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.45rem;
  }
  .flag-grid { display: grid; gap: 0.2rem 0.5rem; }
  .flag-grid.six { grid-template-columns: repeat(3, 1fr); }
  .flag-grid.four { grid-template-columns: repeat(2, 1fr); }
  .flag-grid.two { grid-template-columns: repeat(2, 1fr); }
  .chk {
    display: inline-flex; align-items: center; gap: 0.25rem;
    font-size: 0.8rem; color: var(--ink-soft); cursor: pointer;
  }
  .lbl-block {
    display: flex; flex-direction: column; gap: 0.15rem;
    font-size: 0.78rem; color: var(--ink-soft); margin-top: 0.2rem;
  }
</style>
