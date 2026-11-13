<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import FeatureChoiceFields from './FeatureChoiceFields.svelte';

  let { w }: { w: CharacterWizard } = $props();

  const choices = $derived(w.choicesOf(''));
</script>

{#each w.gaps as gap}
  <p class="warn">{gap}</p>
{/each}
{#if choices.length === 0}
  <p class="hint">
    Keine weiteren Merkmalswahlen auf Stufe 1.
    {#if w.spellPickChoices.length}Die Zauber-Wahl folgt im nächsten Schritt.{/if}
  </p>
{:else}
  <FeatureChoiceFields {w} {choices} />
{/if}
