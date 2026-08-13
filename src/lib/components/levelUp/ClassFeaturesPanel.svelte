<script lang="ts">
  import './levelUp.css';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
</script>

<div class="row">
  <span class="field-label">Klassenmerkmale & Eigenschaften</span>
  <!-- Ob die KI dabei war, steht im Protokoll — der Hinweis muss für beide Fälle stimmen. -->
  <span class="field-hint">Die neuen Merkmale sind ins bestehende Feld eingearbeitet. Du kannst frei nachbearbeiten oder die KI zusammenführen lassen.</span>
  {#if st.gainedFeatures.length}
    <div class="facts">
      {#each st.gainedFeatures as gf}<div class="fact">• {gf.name}{gf.source === 'subclass' ? ' (Subklasse)' : ''}</div>{/each}
    </div>
  {/if}
  <textarea class="textarea ta-features" rows="10" bind:value={st.featuresText}></textarea>
  <button type="button" class="secondary-btn rework-btn" onclick={ui.run.rework} disabled={st.run.kind === 'running'}>🪄 Mit KI zusammenführen</button>
</div>
