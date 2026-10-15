<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { OriginCatalog, OriginKind } from '../../services/wizard/originCatalog';
  import { isMirroredArt, originArtCandidates, resolveOriginArt } from '../../services/wizard/originArt';
  import ClassCardView from '../libraryView/ClassCardView.svelte';
  import SpeciesCardView from '../libraryView/SpeciesCardView.svelte';
  import BackgroundCardView from '../libraryView/BackgroundCardView.svelte';

  let { kind, w, catalog }: { kind: OriginKind; w: CharacterWizard; catalog: OriginCatalog | null } = $props();

  const klass = $derived(catalog?.classes.find((c) => c.key === w.klass.sourceKey) ?? null);
  const species = $derived(catalog?.species.find((s) => s.key === w.species.sourceKey) ?? null);
  const background = $derived(catalog?.backgrounds.find((b) => b.key === w.background.sourceKey) ?? null);

  let art = $state<string | null>(null);
  $effect(() => {
    const candidates = originArtCandidates(kind, {
      classKey: w.klass.sourceKey, speciesKey: w.species.sourceKey, backgroundKey: w.background.sourceKey,
      presentation: w.presentation || undefined,
    });
    let cancelled = false;
    void resolveOriginArt(candidates).then((url) => { if (!cancelled) art = url; });
    return () => { cancelled = true; };
  });

  const EMPTY: Record<OriginKind, string> = {
    class: 'Wähle links eine Klasse — hier erscheinen ihre Beschreibung und alle Merkmale.',
    background: 'Wähle links einen Hintergrund — hier erscheint, was er dir mitgibt.',
    species: 'Wähle links ein Volk — hier erscheinen seine Merkmale.',
  };
</script>

<div class="stage" class:with-art={!!art}>
  {#if art}
    {#key art}
      <figure class="art" in:fly={{ x: 40, duration: 800 }} out:fade={{ duration: 350 }}>
        <img src={art} alt="" class:mirrored={isMirroredArt(art)} />
      </figure>
    {/key}
  {/if}
  <div class="card">
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
  </div>
</div>

<style>
  .stage {
    --stage-w: var(--fw-detail-w, 100%); --art-w: min(calc(var(--stage-w) * 0.58), 540px);
    /* Eingeklappte Vorschau: die Karte wächst nur bis an den ausgeblendeten Bildrand (40px). */
    --card-w: min(100%, max(calc(var(--stage-w) - var(--art-w) + 120px), calc(100% - var(--art-w) + 40px)));
    display: grid; align-items: start;
  }
  .stage.with-art { grid-template-columns: var(--card-w) minmax(0, 1fr); }
  .card { grid-area: 1 / 1; position: relative; z-index: 1; display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
  .note { font-size: 0.82rem; color: var(--ink-muted); margin: 0; }
  .with-art .card :global(.lib-card) {
    max-width: none; backdrop-filter: blur(2px);
    background: color-mix(in srgb, var(--bg) 68%, transparent);
    box-shadow: 18px 0 40px -10px rgba(40, 25, 5, 0.2);
  }
  /* Zentriert zwischen Karte und Spaltenrand — das rechte Spalten-Padding zählt zur freien
     Fläche. Reicht der Platz nicht, schneidet `cover` links und rechts gleich viel ab. */
  .art {
    grid-area: 1 / 2; position: sticky; top: 0; justify-self: center;
    margin: 0 calc(-1 * var(--fw-pad-x, 0px)) 0 0;
    width: min(var(--art-w), 100% + var(--fw-pad-x, 0px)); height: calc(100vh - 12rem); pointer-events: none;
    /* Links weich zur Karte hin, rechts kaum: Die Serie blickt nach rechts, dort sitzen die Gesichter. */
    mask-image: linear-gradient(to right, transparent 0%, #000 30%, #000 84%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 10%, #000 78%, transparent 100%);
    mask-composite: intersect;
  }
  .art img { width: 100%; height: 100%; object-fit: cover; object-position: 62% center; }
  .art img.mirrored { transform: scaleX(-1); object-position: 38% center; }
  @media (max-width: 1100px) {
    .art { display: none; }
    .stage.with-art { grid-template-columns: minmax(0, 1fr); }
  }
</style>
