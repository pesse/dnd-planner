<script lang="ts">
  import { featDisplayName, featDesc, featPrereq, FEAT_CATEGORY_DE, type FeatEntry } from '../featsLibrary';
  import Markdown from './Markdown.svelte';

  let { feat, x, y }: { feat: FeatEntry | null; x: number; y: number } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  // Positionierung wie beim Zauber-Tooltip: x/y ist der Anker (Cursor + Offset),
  // am rechten/unteren Viewport-Rand wird umgeklappt bzw. begrenzt.
  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if feat}
  {@const desc = featDesc(feat)}
  {@const prereq = featPrereq(feat)}
  <div class="feat-tooltip" style="left:{left}px;top:{top}px" bind:clientWidth={boxW} bind:clientHeight={boxH}>
    <div class="tt-name">{featDisplayName(feat)}</div>
    {#if feat.nameDe && feat.nameDe !== feat.name}<div class="tt-name-en">{feat.name}</div>{/if}
    {#if feat.category}<div class="tt-cat">{FEAT_CATEGORY_DE[feat.category]}</div>{/if}
    {#if prereq}<div class="tt-prereq">Voraussetzung: {prereq}</div>{/if}
    {#if desc}
      <div class="tt-divider"></div>
      <div class="tt-desc"><Markdown source={desc} /></div>
    {:else}
      <div class="tt-empty">Keine Beschreibung in der Bibliothek.</div>
    {/if}
  </div>
{/if}

<style>
  .feat-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--gold);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 220px;
    max-width: 360px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }
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
