<script lang="ts">
  import type { Snippet } from 'svelte';
  import { FEAT_CATEGORY_DE, featDesc, featPrereq, type FeatEntry } from '$lib/featsLibrary';
  import { featArtUrl } from '$lib/libraryArt';
  import CardArt from '../ui/CardArt.svelte';
  import LibraryCardFrame from '../ui/LibraryCardFrame.svelte';
  import Markdown from '../Markdown.svelte';

  let { feat, badges }: { feat: FeatEntry; badges?: Snippet } = $props();

  const prereq = $derived(featPrereq(feat));
  const desc = $derived(featDesc(feat));
</script>

<LibraryCardFrame accent="var(--gold)" name={feat.name} nameDe={feat.nameDe}>
  {#snippet art()}<CardArt src={featArtUrl(feat)} color="var(--gold)" />{/snippet}
  {#snippet head()}
    <div class="badges">
      {#if feat.category}<span class="kategorie">{FEAT_CATEGORY_DE[feat.category]}</span>{/if}
      {#if feat.repeatable}<span class="kategorie">mehrfach wählbar</span>{/if}
      {@render badges?.()}
    </div>
    {#if prereq}
      <div class="meta">Voraussetzung: {prereq}</div>
    {/if}
  {/snippet}
  {#if desc}
    <div class="body"><Markdown source={desc} /></div>
  {:else}
    <p class="empty">Keine Beschreibung.</p>
  {/if}
</LibraryCardFrame>

<style>
  .badges {
    display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; margin-top: 0.35rem;
  }
  .kategorie {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-soft); border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    border-radius: 3px; padding: 0.05rem 0.4rem;
  }

  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--gold) 70%, var(--ink)); margin-top: 0.2rem; font-style: italic; }

  .body { padding: 0.7rem 1.2rem 1rem; font-size: 0.85rem; line-height: 1.55; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }
</style>
