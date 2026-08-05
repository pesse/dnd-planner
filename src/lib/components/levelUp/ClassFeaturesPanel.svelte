<script lang="ts">
  import './levelUp.css';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
</script>

<div class="row">
  <span class="field-label">Klassenmerkmale & Eigenschaften</span>
  <span class="field-hint">Die KI hat die neuen Merkmale bereits verkürzt ins bestehende Feld eingearbeitet. Du kannst frei nachbearbeiten oder erneut zusammenführen lassen.</span>
  {#if st.gainedFeatures.length}
    <div class="facts">
      {#each st.gainedFeatures as gf}<div class="fact">• {gf.name}{gf.source === 'subclass' ? ' (Subklasse)' : ''}</div>{/each}
    </div>
  {/if}
  <textarea class="textarea ta-features" rows="10" bind:value={st.featuresText}></textarea>
  <button type="button" class="secondary-btn rework-btn" onclick={ui.run.rework} disabled={st.run.kind === 'running'}>🪄 Nochmal zusammenführen</button>
</div>
