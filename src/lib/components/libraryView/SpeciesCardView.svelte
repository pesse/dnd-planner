<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Species } from '$lib/types';
  import LibraryCardFrame from '../ui/LibraryCardFrame.svelte';
  import Markdown from '../Markdown.svelte';
  import FeatureList from '../FeatureList.svelte';
  import { speciesFacts } from './speciesView';

  let { species, badge }: { species: Species; badge?: Snippet } = $props();

  const facts = $derived(speciesFacts(species));
  const traits = $derived(
    species.traits.map((t, i) => ({
      id: t.key || `${t.name}-${i}`,
      name: t.nameDe || t.name,
      text: t.descDe || t.desc,
      level: t.gainedAt,
      note: t.gainedAt ? `ab Charakterstufe ${t.gainedAt}` : undefined,
    })),
  );
</script>

<LibraryCardFrame accent="var(--green)" name={species.name} nameDe={species.nameDe}>
  {#snippet head()}
    {#if facts.size || facts.speed}
      <div class="meta">
        {#if facts.size}Größe: {facts.size}{/if}
        {#if facts.size && facts.speed} · {/if}
        {#if facts.speed}Bewegungsrate: {facts.speed}{/if}
      </div>
    {/if}
    {@render badge?.()}
  {/snippet}

  {#if species.introDe}
    <div class="intro"><Markdown source={species.introDe} /></div>
  {/if}
  <div class="features">
    {#if traits.length}
      <FeatureList entries={traits} accent="var(--green)" />
    {:else}
      <p class="empty">Keine Merkmale.</p>
    {/if}
  </div>
</LibraryCardFrame>

<style>
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--green) 70%, var(--ink)); margin-top: 0.2rem; }
  .intro { padding: 0.7rem 1.2rem 0; font-size: 0.88rem; line-height: 1.55; }
  .features { padding: 0.6rem 1.2rem 1rem; }
  .empty { margin: 0; color: var(--ink-muted); font-style: italic; }
</style>
