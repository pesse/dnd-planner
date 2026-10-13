<script lang="ts">
  import './levelUp.css';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
</script>

<div class="row">
  <span class="field-label">Klassenmerkmale & Eigenschaften</span>
  <span class="field-hint">Die neuen Merkmale sind ins bestehende Feld eingearbeitet. Du kannst frei nachbearbeiten — oder später im Bearbeiten-Modus mit ✨ zusammenfassen lassen.</span>
  {#if st.gainedFeatures.length}
    <div class="facts">
      {#each st.gainedFeatures as gf}<div class="fact">• {gf.name}{gf.source === 'subclass' ? ' (Subklasse)' : ''}</div>{/each}
    </div>
  {/if}
  <textarea class="textarea ta-features" rows="10" bind:value={st.featuresText}></textarea>
</div>
