<script lang="ts">
  import './levelUp.css';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
</script>

{#if st.delta}
  <div class="row">
    <span class="field-label">Subklasse für {st.delta.klasseName}</span>
    <span class="field-hint">
      Mit der Unterklasse spezialisierst du deine Klasse: Sie bringt jetzt und auf späteren Stufen eigene Merkmale.
      Die Wahl ist dauerhaft — rechts siehst du, was jede Unterklasse dir gibt.
    </span>
    <div class="group-chips">
      {#each st.delta.subclassOptions as sc}
        <button type="button" class="group-chip" class:on={st.chosenSubclass?.key === sc.key}
                onclick={() => (st.chosenSubclass = { key: sc.key, name: sc.name })}>{sc.name}</button>
      {/each}
    </div>
    {#if !st.delta.subclassOptions.length}<span class="field-hint">Keine Subklassen gefunden.</span>{/if}
  </div>
{/if}
