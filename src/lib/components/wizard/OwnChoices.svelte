<script lang="ts">
  /** Die Wahlen, die mit einer Auswahl kommen — über deren Karte, damit sie sofort ins Auge fallen. */
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { AnalysisChoice } from '../../services/analysis/types';
  import FeatureChoiceFields from './FeatureChoiceFields.svelte';

  let { w, choices }: { w: CharacterWizard; choices: AnalysisChoice[] } = $props();
</script>

{#if choices.length}
  <section class="own-choices" aria-label="Deine Wahl">
    <h4>Deine Wahl</h4>
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
</style>
