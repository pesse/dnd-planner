<script lang="ts">
  /**
   * Editor für einen `proficiencyGrant` — die geschlossenen Übungs-Vokabulare.
   * Wird von allen vier Bibliotheks-Editoren benutzt (Klasse, Hintergrund,
   * Spezies-Merkmal, Talent); `scope="skills"` blendet alles außer den
   * Fertigkeiten aus, weil Hintergründe/Merkmale/Talente im SRD 5.2 nur diese
   * gewähren.
   */
  import { ABILITY_NAMES } from '$lib/schemas/abilities';
  import { ARMOR_TRAININGS, WEAPON_CATEGORIES } from '$lib/schemas/vocabulary';
  import type { AbilityName } from '$lib/schemas/abilities';
  import type { ArmorTraining, WeaponCategory } from '$lib/schemas/vocabulary';
  import type { ProficiencyGrant } from '$lib/schemas/grants';
  import { ABILITY_LABEL_DE, ARMOR_LABEL_DE, WEAPON_LABEL_DE } from '$lib/services/proficiencyGrants';
  import SkillGrantEditForm from './SkillGrantEditForm.svelte';

  let {
    grant = $bindable<ProficiencyGrant>(),
    scope = 'full',
    onchange = () => void 0,
  }: {
    grant: ProficiencyGrant;
    /** 'skills' = nur Fertigkeiten (Hintergrund/Merkmal/Talent). */
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

  // `weaponsOther` sind Einzel-/Sonderregeln („Martial weapons that have the Light
  // property") — englischer Freitext, eine Zeile mit Semikolon getrennt.
  let otherText = $state(grant.weaponsOther.join('; '));

  function onOtherInput() {
    grant.weaponsOther = otherText.split(';').map((s) => s.trim()).filter(Boolean);
    onchange();
  }
</script>

<div class="grant-block">
  <div class="sub-title">Fertigkeiten</div>
  <SkillGrantEditForm bind:grant={grant.skills} {onchange} />

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
          {ABILITY_LABEL_DE[ability]}
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
  .ef {
    background: var(--bg-panel); border: 1px solid transparent; border-radius: 3px;
    color: var(--ink); font-family: inherit; font-size: 0.88rem; padding: 0.15rem 0.3rem; outline: none;
    width: 100%;
  }
  .ef:hover { border-color: var(--border); }
  .ef:focus { border-color: var(--mef-accent, var(--arcane)); }

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
