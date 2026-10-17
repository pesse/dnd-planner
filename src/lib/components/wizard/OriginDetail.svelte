<script lang="ts">
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { OriginCatalog, OriginKind } from '../../services/wizard/originCatalog';
  import { originArtCandidates } from '../../services/wizard/originArt';
  import ArtStage from '../ui/ArtStage.svelte';
  import ClassCardView from '../libraryView/ClassCardView.svelte';
  import SpeciesCardView from '../libraryView/SpeciesCardView.svelte';
  import BackgroundCardView from '../libraryView/BackgroundCardView.svelte';

  let { kind, w, catalog }: { kind: OriginKind; w: CharacterWizard; catalog: OriginCatalog | null } = $props();

  const klass = $derived(catalog?.classes.find((c) => c.key === w.klass.sourceKey) ?? null);
  const species = $derived(catalog?.species.find((s) => s.key === w.species.sourceKey) ?? null);
  const background = $derived(catalog?.backgrounds.find((b) => b.key === w.background.sourceKey) ?? null);

  const candidates = $derived(originArtCandidates(kind, {
    classKey: w.klass.sourceKey, speciesKey: w.species.sourceKey, backgroundKey: w.background.sourceKey,
    presentation: w.presentation || undefined,
  }));

  const EMPTY: Record<OriginKind, string> = {
    class: 'Wähle links eine Klasse — hier erscheinen ihre Beschreibung und alle Merkmale.',
    background: 'Wähle links einen Hintergrund — hier erscheint, was er dir mitgibt.',
    species: 'Wähle links ein Volk — hier erscheinen seine Merkmale.',
  };
</script>

<ArtStage {candidates}>
  {#if kind === 'class' && klass}
    <ClassCardView {klass} openUpTo={1} />
    <p class="note">Merkmale ab Stufe 2 erhältst du beim Stufenaufstieg — klappe sie auf, um vorauszuschauen.</p>
  {:else if kind === 'species' && species}
    <SpeciesCardView {species} />
  {:else if kind === 'background' && background}
    <BackgroundCardView {background} />
  {:else}
    <p class="note">{EMPTY[kind]}</p>
  {/if}
</ArtStage>

<style>
  .note { font-size: 0.82rem; color: var(--ink-muted); margin: 0; }
</style>
