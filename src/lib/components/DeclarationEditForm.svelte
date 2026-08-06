<script module lang="ts">
  import { type FeatureChoiceGrant } from '$lib/schemas/featureChoice';
  import { type FeatureGrant, type SpellGrant } from '$lib/schemas/grants';
  export { kindOptions, type DeclarationCarrier } from './FeatureChoiceEditForm.svelte';

  export interface DeclarationTarget {
    grants?: FeatureGrant;
    grantsChoice?: FeatureChoiceGrant[];
    grantsSpells?: SpellGrant;
  }
</script>

<script lang="ts">
  /**
   * Editor der drei Deklarationen eines Merkmals (`featureDeclarationFields`); `kinds` ist
   * das einzige, was Klassenmerkmal, Trait und Talent unterschiedlich übergeben.
   *
   * Jede Checkbox schaltet zwischen FEHLENDEM Feld („nie angesehen", läuft weiter über die
   * KI-Kette) und geparstem Default („geprüft") — diese Unterscheidung darf die UI nicht
   * einebnen, sonst geht jede Abdeckungslücke still verloren. Bei den Wahlen ist die leere
   * LISTE die geprüfte Form.
   */
  import { featureGrantSchema, spellGrantSchema } from '$lib/schemas/grants';
  import FeatureChoiceEditForm, { DEFAULT_CHOICE_KIND, newChoice, type DeclarationCarrier } from './FeatureChoiceEditForm.svelte';
  import FeatureGrantEditForm from './FeatureGrantEditForm.svelte';

  let {
    feature = $bindable<DeclarationTarget>(),
    carrier = 'feature',
    scope = 'full',
    onchange = () => void 0,
  }: {
    feature: DeclarationTarget;
    carrier?: DeclarationCarrier;
    scope?: 'full' | 'skills';
    onchange?: () => void;
  } = $props();

  const emptyChoice = () => newChoice({ kind: DEFAULT_CHOICE_KIND, options: [] });

  const toggleChoice = (on: boolean) => {
    feature.grantsChoice = on ? [emptyChoice()] : undefined;
    onchange();
  };
  const addChoice = () => {
    feature.grantsChoice = [...(feature.grantsChoice ?? []), emptyChoice()];
    onchange();
  };
  const removeChoice = (i: number) => {
    feature.grantsChoice = (feature.grantsChoice ?? []).filter((_, j) => j !== i);
    onchange();
  };
  const toggleGrants = (on: boolean) => {
    feature.grants = on ? featureGrantSchema.parse({}) : undefined;
    onchange();
  };
  const toggleSpells = (on: boolean) => {
    feature.grantsSpells = on ? spellGrantSchema.parse({ kind: 'levelTable' }) : undefined;
    onchange();
  };
</script>

<div class="decl">
  <div class="row">
    <label class="lbl" class:off={!feature.grantsChoice}>
      <input type="checkbox" checked={!!feature.grantsChoice} onchange={(e) => toggleChoice((e.target as HTMLInputElement).checked)} />
      Gewährt Wahl
    </label>
    {#if feature.grantsChoice}
      <button type="button" class="add" onclick={addChoice}>+ Wahl</button>
    {/if}
  </div>

  {#if feature.grantsChoice}
    {#each feature.grantsChoice as _, i (i)}
      <FeatureChoiceEditForm
        bind:grant={feature.grantsChoice[i]}
        {carrier}
        {scope}
        {onchange}
        onremove={() => removeChoice(i)}
      />
    {/each}
    {#if !feature.grantsChoice.length}
      <span class="note">Geprüft: dieses Merkmal gewährt keine Wahl</span>
    {/if}
  {/if}

  <div class="row">
    <label class="lbl" class:off={!feature.grants}>
      <input type="checkbox" checked={!!feature.grants} onchange={(e) => toggleGrants((e.target as HTMLInputElement).checked)} />
      Gewährt Mechanik
    </label>
    <label class="lbl" class:off={!feature.grantsSpells}>
      <input type="checkbox" checked={!!feature.grantsSpells} onchange={(e) => toggleSpells((e.target as HTMLInputElement).checked)} />
      Gewährt Zauberliste
    </label>
    {#if feature.grantsSpells}
      <span class="note">Die Zaubernamen stehen als Stufentabelle im Regeltext</span>
    {/if}
  </div>

  {#if feature.grants}
    <FeatureGrantEditForm bind:grant={feature.grants} {scope} {onchange} />
  {/if}
</div>

<style>
  .decl { display: flex; flex-direction: column; gap: 0.35rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
  .lbl {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.8rem; color: var(--ink-soft);
  }
  .lbl.off { opacity: 0.6; }
  .note { font-size: 0.75rem; color: var(--ink-soft); font-style: italic; }
  .add {
    border: 1px solid var(--border); border-radius: 4px; background: none; cursor: pointer;
    font-size: 0.75rem; padding: 0.1rem 0.4rem; color: var(--ink-soft);
  }
</style>
