<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { OriginCatalog, OriginKind } from '../../services/wizard/originCatalog';
  import { COMPLEXITY_LABELS, primaryAbilityText } from '../libraryView/classView';
  import { speciesFacts } from '../libraryView/speciesView';
  import { abilityKeyOf, ABILITY_LABEL } from '$lib/schemas/abilities';
  import { skillLabelDe } from '$lib/services/proficiencyGrants';
  import { PRESENTATIONS, type Presentation } from '$lib/schemas/characterSchema';
  import { originArtCandidates } from '../../services/wizard/originArt';
  import ChoiceOption from './ChoiceOption.svelte';

  let { kind, w, catalog }: { kind: OriginKind; w: CharacterWizard; catalog: OriginCatalog | null } = $props();

  interface Tile { key: string; title: string; subtitle: string; tags: { label: string; easy?: boolean }[] }

  const displayName = (e: { name: string; nameDe?: string }): string => e.nameDe || e.name;

  const tiles = $derived.by<Tile[]>(() => {
    if (!catalog) return [];
    if (kind === 'class') {
      return catalog.classes.map((c) => ({
        key: c.key,
        title: displayName(c),
        subtitle: c.overview?.favoredDe ?? '',
        tags: c.overview
          ? [
              { label: primaryAbilityText(c.overview) },
              { label: COMPLEXITY_LABELS[c.overview.complexity], easy: c.overview.complexity === 'low' },
            ]
          : [],
      }));
    }
    if (kind === 'species') {
      return catalog.species.map((s) => {
        const f = speciesFacts(s);
        return { key: s.key, title: displayName(s), subtitle: [f.size, f.speed].filter(Boolean).join(' · '), tags: [] };
      });
    }
    return catalog.backgrounds.map((b) => ({
      key: b.key,
      title: displayName(b),
      subtitle: b.abilityScores.map((a) => { const k = abilityKeyOf(a); return k ? ABILITY_LABEL[k] : a; }).join(' · '),
      tags: b.proficiencyGrant.skills.fixed.map((s) => ({ label: skillLabelDe(s) })),
    }));
  });

  const selectedKey = $derived(
    kind === 'class' ? w.klass.sourceKey : kind === 'species' ? w.species.sourceKey : w.background.sourceKey,
  );

  function select(t: Tile) {
    const link = { sourceKey: t.key, name: t.title };
    if (kind === 'class') w.klass = link;
    else if (kind === 'species') w.species = link;
    else w.background = link;
  }

  const PRESENTATION_LABEL: Record<Presentation, string> = {
    feminine: 'Feminin', androgynous: 'Neutral', masculine: 'Maskulin',
  };

  const slugOf = (key: string): string => key.slice(key.indexOf('_') + 1);

  /** Nur Bilder dieser Option selbst — ein Rückfall aufs Volksbild sähe in jeder Zeile gleich aus. */
  function tileArt(key: string): string[] {
    const keys = {
      speciesKey: kind === 'species' ? key : w.species.sourceKey,
      classKey: kind === 'class' ? key : '',
      backgroundKey: kind === 'background' ? key : '',
      presentation: w.presentation || undefined,
    };
    return originArtCandidates(kind, keys).filter((u) => u.includes(slugOf(key)));
  }

  const presentationArt = (p: Presentation): string[] =>
    w.species.sourceKey
      ? originArtCandidates('species', { speciesKey: w.species.sourceKey, classKey: '', backgroundKey: '', presentation: p }).slice(0, 1)
      : [];

  const HEADING: Record<OriginKind, string> = { species: 'Volk', background: 'Hintergrund', class: 'Klasse' };

  const HINTS: Record<OriginKind, string> = {
    class: 'Deine Klasse bestimmt, was dein Charakter im Abenteuer am besten kann. Neu dabei? Klassen mit „Einfach“ sind ein guter Start.',
    background: 'Dein Hintergrund erzählt, was du vor dem Abenteuer warst — er gibt dir Attributsboni, Fertigkeiten, ein Herkunftstalent und Ausrüstung.',
    species: 'Dein Volk bringt angeborene Merkmale mit, etwa Dunkelsicht oder besondere Widerstände.',
  };
</script>

<p class="hint">{HINTS[kind]}</p>
{#if kind === 'species'}
  <h3 class="heading">Äußeres</h3>
  <div class="options" role="radiogroup" aria-label="Äußeres">
    {#each PRESENTATIONS as p (p)}
      <ChoiceOption title={PRESENTATION_LABEL[p]} selected={w.presentation === p} art={presentationArt(p)}
        onselect={() => (w.presentation = p)} />
    {/each}
  </div>
{/if}
<h3 class="heading">{HEADING[kind]}</h3>
{#if !catalog}
  <p class="hint">Lade Bibliothek …</p>
{:else}
  <div class="options" role="radiogroup" aria-label={HEADING[kind]}>
    {#each tiles as t (t.key)}
      <ChoiceOption title={t.title} subtitle={t.subtitle} tags={t.tags} selected={t.key === selectedKey}
        art={tileArt(t.key)} onselect={() => select(t)} />
    {/each}
  </div>
{/if}

<style>
  .heading {
    font-family: var(--font-display); font-size: 0.95rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--gold); text-align: center; margin: 0.9rem 0 0.45rem; padding-bottom: 0.55rem;
    background: url('/branding/wizard/divider.png') center bottom / 100% 0.7rem no-repeat;
  }
  .options { display: flex; flex-direction: column; gap: 0.3rem; }
</style>
