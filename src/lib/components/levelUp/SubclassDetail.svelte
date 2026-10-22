<script lang="ts">
  import './levelUp.css';
  import type { ClassProgression } from '$lib/types';
  import type { LevelUpAssistantUi } from './assistantState.svelte';
  import { getProgressionByKey } from '../../services/classProgression';
  import { subclassArtCandidates } from '../../services/levelUp/subclassArt';
  import { classFeatureEntries } from '../libraryView/classView';
  import ArtStage from '../ui/ArtStage.svelte';
  import LibraryCardFrame from '../ui/LibraryCardFrame.svelte';
  import Markdown from '../Markdown.svelte';
  import FeatureList from '../FeatureList.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);

  let sub = $state<ClassProgression | null>(null);
  $effect(() => {
    const key = st.chosenSubclass?.key;
    sub = null;
    if (!key) return;
    let cancelled = false;
    void getProgressionByKey(key).then((p) => { if (!cancelled) sub = p; }, () => {});
    return () => { cancelled = true; };
  });

  const candidates = $derived(st.chosenSubclass && st.delta
    ? subclassArtCandidates(st.chosenSubclass.key, {
      classKey: st.delta.sourceKey, speciesKey: ui.character.species.sourceKey, presentation: ui.character.presentation,
    })
    : []);
</script>

<ArtStage {candidates}>
  {#if !st.chosenSubclass}
    <p class="hint">Wähle links eine Unterklasse — hier erscheinen ihre Beschreibung und alle Merkmale.</p>
  {:else if sub}
    <LibraryCardFrame accent="var(--copper)" name={sub.name} nameDe={sub.nameDe}>
      {#if sub.introDe}<div class="intro"><Markdown source={sub.introDe} /></div>{/if}
      <div class="features">
        <FeatureList entries={classFeatureEntries(sub.features)} openUpTo={st.delta?.toLevel ?? 1} />
      </div>
    </LibraryCardFrame>
    <p class="hint">Merkmale späterer Stufen erhältst du beim nächsten Aufstieg — klappe sie auf, um vorauszuschauen.</p>
  {/if}
</ArtStage>

<style>
  .intro { padding: 0.7rem 1.2rem 0; font-size: 0.88rem; line-height: 1.55; }
  .features { padding: 0.6rem 1.2rem 1rem; }
</style>
