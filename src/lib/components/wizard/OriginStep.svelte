<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { OriginCatalog, OriginKind } from '../../services/wizard/originCatalog';
  import { COMPLEXITY_LABELS, primaryAbilityText } from '../libraryView/classView';
  import { speciesFacts } from '../libraryView/speciesView';
  import { abilityKeyOf, ABILITY_LABEL } from '$lib/schemas/abilities';
  import { skillLabelDe } from '$lib/services/proficiencyGrants';

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

  const HINTS: Record<OriginKind, string> = {
    class: 'Deine Klasse bestimmt, was dein Charakter im Abenteuer am besten kann. Neu dabei? Klassen mit „Einfach“ sind ein guter Start.',
    background: 'Dein Hintergrund erzählt, was du vor dem Abenteuer warst — er gibt dir Attributsboni, Fertigkeiten, ein Herkunftstalent und Ausrüstung.',
    species: 'Dein Volk bringt angeborene Merkmale mit, etwa Dunkelsicht oder besondere Widerstände.',
  };
</script>

<p class="hint">{HINTS[kind]}</p>
{#if !catalog}
  <p class="hint">Lade Bibliothek …</p>
{:else}
  <div class="tiles">
    {#each tiles as t (t.key)}
      <button type="button" class="tile" class:sel={t.key === selectedKey} onclick={() => select(t)}>
        <span class="tile-title">{t.title}</span>
        {#if t.subtitle}<span class="tile-sub">{t.subtitle}</span>{/if}
        {#if t.tags.length}
          <span class="tile-tags">
            {#each t.tags as tag}<span class="tag" class:easy={tag.easy}>{tag.label}</span>{/each}
          </span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.4rem; }
  .tile {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; text-align: left;
    background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.4rem 0.55rem; cursor: pointer; font: inherit;
  }
  .tile:hover { border-color: var(--border-strong); }
  .tile.sel { border-color: var(--arcane, var(--gold)); box-shadow: inset 0 0 0 1px var(--arcane, var(--gold)); }
  .tile-title { font-weight: 700; font-size: 0.9rem; }
  .tile-sub { font-size: 0.74rem; color: var(--ink-soft); line-height: 1.3; }
  .tile-tags { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .tag {
    font-size: 0.7rem; color: var(--ink-muted); border: 1px solid var(--border);
    border-radius: 999px; padding: 0 0.45rem;
  }
  .tag.easy { color: var(--green, var(--ink)); border-color: var(--green, var(--border-strong)); }
</style>
