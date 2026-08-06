<script lang="ts">
  import './levelUp.css';
  import { featDisplayName } from '$lib/featsLibrary';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
</script>

{#if st.delta}
  <div class="row">
    <span class="field-label">{st.featsToPick} Talent(e) wählen</span>
    <div class="chips">
      {#each st.chosenFeats as f}
        <span class="pick">{f.nameDe}<button type="button" onclick={() => (st.chosenFeats = st.chosenFeats.filter((x) => x.name !== f.name))}>×</button></span>
      {/each}
    </div>
    <input class="input" placeholder="Talent suchen…" value={ui.featQuery} oninput={(e) => (ui.featQuery = (e.target as HTMLInputElement).value)} />
    {#if ui.featQuery.trim()}
      <div class="results">
        {#each ui.featResults() as entry}
          <button type="button" class="result" onclick={() => ui.toggleFeat(entry)} disabled={st.chosenFeats.length >= st.featsToPick && !st.chosenFeats.some((f) => f.nameDe === featDisplayName(entry))}>{featDisplayName(entry)}</button>
        {/each}
        {#if !ui.featResults().length}<span class="field-hint">Keine Treffer im Talent-Wörterbuch.</span>{/if}
      </div>
    {/if}
    <span class="field-hint">{st.chosenFeats.length} / {st.featsToPick} gewählt</span>
  </div>
{/if}
