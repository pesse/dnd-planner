<script lang="ts">
  import './levelUp.css';
  import type { LevelUpAssistantUi } from './assistantState.svelte';
  import { subclassArtCandidates } from '../../services/levelUp/subclassArt';
  import ChoiceGroup from '../wizard/ChoiceGroup.svelte';
  import ChoiceOption from '../wizard/ChoiceOption.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);

  /** Nur das Bild dieser Subklasse — der Rückfall aufs Klassenbild sähe in jeder Zeile gleich aus. */
  const optionArt = (key: string): string[] =>
    subclassArtCandidates(key, {
      classKey: st.delta?.sourceKey ?? '', speciesKey: ui.character.species.sourceKey, presentation: ui.character.presentation,
    }).filter((u) => u.includes('/subclasses/'));
</script>

{#if st.delta}
  <span class="hint">
    Mit der Unterklasse spezialisierst du deine Klasse: Sie bringt jetzt und auf späteren Stufen eigene Merkmale.
    Die Wahl ist dauerhaft — rechts siehst du, was jede Unterklasse dir gibt.
  </span>
  <ChoiceGroup heading="Subklasse für {st.delta.klasseName}">
    {#each st.delta.subclassOptions as sc (sc.key)}
      <ChoiceOption title={sc.name} selected={st.chosenSubclass?.key === sc.key} art={optionArt(sc.key)}
        onselect={() => ui.run.previewSubclass(sc.key, sc.name)} />
    {/each}
  </ChoiceGroup>
  {#if !st.delta.subclassOptions.length}<span class="hint">Keine Subklassen gefunden.</span>{/if}
{/if}
