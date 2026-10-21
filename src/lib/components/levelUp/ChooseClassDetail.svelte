<script lang="ts">
  import type { LevelUpAssistantUi } from './assistantState.svelte';
  import { originArtCandidates } from '../../services/wizard/originArt';
  import ArtStage from '../ui/ArtStage.svelte';
  import ClassCardView from '../libraryView/ClassCardView.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();

  const klass = $derived(ui.baseClasses.find((c) => c.key === ui.selectedClassKey) ?? null);
  const candidates = $derived(originArtCandidates('class', {
    classKey: ui.selectedClassKey, speciesKey: ui.character.species.sourceKey, backgroundKey: '',
    presentation: ui.character.presentation,
  }));
</script>

<ArtStage {candidates}>
  {#if klass}
    <ClassCardView {klass} openUpTo={ui.targetLevel} />
  {:else}
    <p class="note">{ui.isNewClass ? 'Wähle links eine Klasse — hier erscheinen ihre Beschreibung und alle Merkmale.' : 'Für diese Klasse gibt es keinen Bibliothekseintrag.'}</p>
  {/if}
</ArtStage>

<style>
  .note { font-size: 0.82rem; color: var(--ink-muted); margin: 0; }
</style>
