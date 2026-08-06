<script lang="ts">
  /**
   * Editor eines deklarierten Zauber-Zugangs. `spellAccess` DEKLARIERT, wo `spellcasting`
   * ABLEITET: ein Talent hat keine Stufentabelle, also stehen Liste, Attribut und
   * Kontingent hier.
   *
   * Zwei unsichtbare Regeln, die die Oberfläche zeigen muss: bei LÄNGE 1 ist die Liste
   * festgelegt und es entsteht keine Frage, ab LÄNGE 2 eine protokollierte Entscheidung;
   * die Einträge sind englische Klassen-Keys, damit keine Übersetzungstabelle entsteht.
   */
  import { ABILITY_NAMES, type AbilityName } from '$lib/schemas/abilities';
  import { type FeatureChoiceGrant } from '$lib/schemas/featureChoice';
  import { abilityLabelDe } from '$lib/services/proficiencyGrants';

  let {
    grant = $bindable<FeatureChoiceGrant>(),
    onchange = () => void 0,
  }: {
    grant: FeatureChoiceGrant;
    onchange?: () => void;
  } = $props();

  // Einmal initialisiert wie die `weaponsOther`-Zeile in ProficiencyGrantEditForm: eine
  // abgeleitete Zeichenkette würde beim Tippen das Trennzeichen wegkürzen.
  let listText = $state(grant.spellLists.join(', '));

  function onListInput() {
    grant.spellLists = listText.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    onchange();
  }

  function toggleAbility(value: AbilityName, checked: boolean) {
    grant.spellAbilities = checked
      ? [...grant.spellAbilities, value]
      : grant.spellAbilities.filter((v) => v !== value);
    onchange();
  }

  function addPick() {
    grant.spellPicks = [...grant.spellPicks, { level: 0, count: 1 }];
    onchange();
  }

  function removePick(i: number) {
    grant.spellPicks = grant.spellPicks.filter((_, idx) => idx !== i);
    onchange();
  }
</script>

<div class="sa-block">
  <p class="hint">
    Bei <strong>Liste</strong> und <strong>Attribut</strong> heißt ein einzelner Wert
    <em>festgelegt</em> — der Flow fragt nicht. Mehrere Werte werden zur protokollierten Wahl.
  </p>

  <label class="lbl-block">
    Zauberlisten (englische Klassen-Keys, Komma)
    <input class="ef" bind:value={listText} oninput={onListInput} placeholder="cleric, druid, wizard" />
  </label>

  <div class="sub-title">Zauberattribut</div>
  <div class="flag-grid">
    {#each ABILITY_NAMES as ability}
      <label class="chk">
        <input
          type="checkbox"
          checked={grant.spellAbilities.includes(ability)}
          onchange={(e) => toggleAbility(ability, (e.target as HTMLInputElement).checked)}
        />
        {abilityLabelDe(ability)}
      </label>
    {/each}
  </div>

  <div class="sub-title">Kontingent je Gradband</div>
  {#each grant.spellPicks as pick, i}
    <div class="pick-row">
      <label class="lbl-inline">Grad
        <input class="ef num" type="number" min="0" max="9" bind:value={pick.level} oninput={onchange} />
      </label>
      <label class="lbl-inline">Anzahl
        <input class="ef num" type="number" min="1" bind:value={pick.count} oninput={onchange} />
      </label>
      <span class="pick-note">{pick.level === 0 ? 'Zaubertricks' : `Zauber des Grades ${pick.level}`}</span>
      <button class="pick-del" onclick={() => removePick(i)} title="Gradband entfernen">×</button>
    </div>
  {/each}
  <button class="add-pick" onclick={addPick}>+ Gradband</button>
</div>

<style>
  .ef { width: 100%; }
  .num { width: 56px; text-align: center; }

  .sa-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; margin: 0 0 0.1rem; line-height: 1.45; }
  .hint strong { color: var(--ink-soft); font-weight: 600; }

  .sub-title {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--ink-muted); margin-top: 0.2rem;
  }
  .lbl-block { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.78rem; color: var(--ink-soft); }
  .lbl-inline { font-size: 0.78rem; }

  .flag-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.15rem 0.4rem; }
  .chk {
    display: inline-flex; align-items: center; gap: 0.25rem;
    font-size: 0.78rem; color: var(--ink-soft); cursor: pointer;
  }

  .pick-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  .pick-note { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }
  .pick-del {
    background: none; border: none; color: var(--ink-muted); cursor: pointer;
    font-size: 1.1rem; line-height: 1; padding: 0 0.15rem;
  }
  .pick-del:hover { color: var(--danger); }

  .add-pick {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); cursor: pointer;
    font-family: inherit; font-size: 0.78rem; padding: 0.2rem 0.55rem; margin-top: 0.2rem;
  }
  .add-pick:hover { border-color: var(--mef-accent, var(--arcane)); color: var(--mef-accent, var(--arcane)); }
</style>
