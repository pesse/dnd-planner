<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassProgression } from '$lib/types';
  import LibraryCardFrame from '../ui/LibraryCardFrame.svelte';
  import Markdown from '../Markdown.svelte';
  import FeatureList, { type FeatureListEntry } from '../FeatureList.svelte';
  import {
    CASTER_LABELS, COMPLEXITY_LABELS, primaryAbilityText, classCoreRows, classFeatureEntries,
  } from './classView';

  let { klass, badge, openUpTo = 20, extraFeatures = [] }: {
    klass: ClassProgression;
    /** Zusatz im Kartenkopf, z.B. das Deklarations-Badge der Bibliothek. */
    badge?: Snippet;
    openUpTo?: number;
    /** Weitere Merkmale, etwa die einer Unterklasse, in derselben Liste. */
    extraFeatures?: FeatureListEntry[];
  } = $props();

  const rows = $derived([
    ...(klass.overview?.favoredDe ? [{ label: 'Vorliebe', value: klass.overview.favoredDe }] : []),
    ...classCoreRows(klass),
  ]);
  const features = $derived([...classFeatureEntries(klass.features), ...extraFeatures]);
  const equipment = $derived(klass.startingEquipmentDe || klass.startingEquipment);
</script>

<LibraryCardFrame accent="var(--copper)" name={klass.name} nameDe={klass.nameDe}>
  {#snippet head()}
    <div class="meta">
      {CASTER_LABELS[klass.casterType] ?? klass.casterType}
      {#if klass.hitDie} · Trefferwürfel W{klass.hitDie}{/if}
    </div>
    {#if klass.overview}
      <div class="meta">
        Hauptattribut: {primaryAbilityText(klass.overview)} · Komplexität: {COMPLEXITY_LABELS[klass.overview.complexity]}
      </div>
    {/if}
    {@render badge?.()}
  {/snippet}

  {#if klass.introDe}
    <div class="intro"><Markdown source={klass.introDe} /></div>
  {/if}
  {#if rows.length || equipment}
    <div class="core-traits">
      {#each rows as r}
        <div class="core-row">
          <span class="core-label">{r.label}</span>
          <span class="core-value">{r.value}</span>
        </div>
      {/each}
      {#if equipment}
        <div class="core-row">
          <span class="core-label">Anfangsausrüstung</span>
          <span class="core-value">{equipment}</span>
        </div>
      {/if}
    </div>
  {/if}
  <div class="features">
    {#if features.length}
      <FeatureList entries={features} {openUpTo} accent="var(--copper)" />
    {:else}
      <p class="empty">Keine Merkmale.</p>
    {/if}
  </div>
</LibraryCardFrame>

<style>
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--copper) 70%, var(--ink)); margin-top: 0.2rem; }
  .intro { padding: 0.7rem 1.2rem 0; font-size: 0.88rem; line-height: 1.55; }
  .core-traits {
    padding: 0.6rem 1.2rem 0; display: flex; flex-direction: column; gap: 0.2rem;
    font-size: 0.82rem; line-height: 1.45;
  }
  .core-row { display: grid; grid-template-columns: 10.5rem 1fr; gap: 0.5rem; align-items: baseline; }
  .core-label { font-variant: small-caps; font-weight: 700; color: var(--copper); }
  .core-value { color: var(--ink); }
  .features { padding: 0.6rem 1.2rem 1rem; }
  .empty { margin: 0; color: var(--ink-muted); font-style: italic; }
</style>
