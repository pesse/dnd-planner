<script lang="ts">
  /** Abschnitt eines Bibliotheks-Formulars: Trennlinie, Überschrift, Hinweiszeile. */
  import type { Snippet } from 'svelte';

  let {
    title,
    divider = true,
    gap = '0.35rem',
    hint,
    children,
  }: {
    title?: string;
    divider?: boolean;
    gap?: string;
    hint?: Snippet;
    children: Snippet;
  } = $props();
</script>

{#if divider}<div class="divider"></div>{/if}
<div class="section" style="--section-gap: {gap}">
  {#if title}<div class="section-title">{title}</div>{/if}
  {#if hint}<p class="section-hint">{@render hint()}</p>{/if}
  {@render children()}
</div>

<style>
  .divider {
    height: 2px;
    background: linear-gradient(to right, var(--bg-raised), var(--mef-accent, var(--arcane)) 55%);
    margin: 0.6rem 0; border-radius: 1px;
  }

  .section { display: flex; flex-direction: column; gap: var(--section-gap); }
  .section-title {
    font-size: 1rem; font-weight: 700; color: var(--mef-accent, var(--arcane));
    margin: 0 0 0.3rem; font-variant: small-caps;
    border-bottom: 1px solid var(--mef-accent, var(--arcane)); padding-bottom: 0.15rem;
  }
  .section-hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; margin: 0 0 0.2rem; }
</style>
