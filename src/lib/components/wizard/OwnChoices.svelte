<script lang="ts">
  /** Die Wahlen, die mit einer Auswahl kommen — über deren Karte, damit sie sofort ins Auge fallen. */
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { AnalysisChoice } from '../../services/analysis/types';
  import type { ChoiceOwner } from '../../services/wizard/choiceOwners';
  import FeatureChoiceFields from './FeatureChoiceFields.svelte';

  let { w, owners }: { w: CharacterWizard; owners: ChoiceOwner[] } = $props();

  const choices = $derived<AnalysisChoice[]>(owners.flatMap((o) => w.choicesOf(o)));
  const facts = $derived(owners.flatMap((o) => w.factsOf(o)));
</script>

{#if choices.length || facts.length}
  <section class="own-choices" aria-label="Deine Wahl">
    <h4>Deine Wahl</h4>
    {#each facts as f (`${f.featureDe}|${f.part}`)}
      <p class="fact">
        {f.featureDe}: {f.labelDe} <b>{f.valueDe}</b>{#if f.fromSource}<span class="src"> · durch den Hintergrund festgelegt</span>{/if}
      </p>
    {/each}
    <FeatureChoiceFields {w} {choices} />
  </section>
{/if}

<style>
  .own-choices {
    display: flex; flex-direction: column; gap: 0.5rem;
    margin: 0 0 0.75rem; padding: 0.6rem 0.8rem; border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--arcane) 45%, var(--border));
    background: color-mix(in srgb, var(--arcane) 8%, var(--bg-panel));
  }
  h4 { margin: 0; font-size: 0.85rem; color: var(--arcane); }
  .fact { margin: 0; font-size: 0.82rem; color: var(--ink-soft); }
  .src { color: var(--ink-muted); }
</style>
