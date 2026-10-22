<script lang="ts">
  /** Talent-Steckbrief — im Tooltip wie im Detail-Popup derselbe. */
  import { featDisplayName, featDesc, featPrereq, FEAT_CATEGORY_DE, type FeatEntry } from '../featsLibrary';
  import { featArtUrl } from '../libraryArt';
  import Markdown from './Markdown.svelte';
  import ArtFrame from './ui/ArtFrame.svelte';

  let { feat }: { feat: FeatEntry } = $props();

  const desc = $derived(featDesc(feat));
  const prereq = $derived(featPrereq(feat));
</script>

<div class="tt-head">
  <div class="tt-title">
    <div class="tt-name">{featDisplayName(feat)}</div>
    {#if feat.nameDe && feat.nameDe !== feat.name}<div class="tt-name-en">{feat.name}</div>{/if}
    {#if feat.category}<div class="tt-cat">{FEAT_CATEGORY_DE[feat.category]}</div>{/if}
    {#if prereq}<div class="tt-prereq">Voraussetzung: {prereq}</div>{/if}
  </div>
  <ArtFrame src={featArtUrl(feat)} color="var(--gold)" />
</div>
{#if desc}
  <div class="tt-divider"></div>
  <div class="tt-desc"><Markdown source={desc} /></div>
{:else}
  <div class="tt-empty">Keine Beschreibung in der Bibliothek.</div>
{/if}

<style>
  .tt-head { display: flex; align-items: flex-start; gap: 0.6rem; }
  .tt-title { flex: 1; min-width: 0; }
  .tt-name { font-weight: 600; font-size: 0.88rem; color: var(--gold); font-variant: small-caps; }
  .tt-name-en { font-size: 0.74rem; font-style: italic; color: var(--ink-muted); }
  .tt-cat {
    display: inline-block; margin-top: 0.25rem;
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft);
    border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent); border-radius: 3px; padding: 0.05rem 0.35rem;
  }
  .tt-prereq { margin-top: 0.25rem; font-size: 0.76rem; font-style: italic; color: color-mix(in srgb, var(--gold) 70%, var(--ink)); }
  .tt-divider { border-top: 1px solid var(--surface); margin: 0.45rem 0; }
  .tt-desc { font-size: 0.77rem; color: var(--ink-soft); line-height: 1.5; }
  .tt-empty { margin-top: 0.4rem; font-size: 0.76rem; font-style: italic; color: var(--ink-muted); }
</style>
