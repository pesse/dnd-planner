<script lang="ts">
  import type { Snippet } from 'svelte';
  import { glossaryTip } from '$lib/services/glossaryTip';
  import { textTip } from './textTip.svelte';

  let { term, children }: {
    /** Glossar-Stichwort, z.B. „Trefferpunktewürfel" für die Anzeige „Trefferwürfel". */
    term: string;
    children?: Snippet;
  } = $props();

  const tip = $derived(glossaryTip(term));
</script>

{#if tip}
  <span class="term" use:textTip={tip}>{#if children}{@render children()}{:else}{term}{/if}</span>
{:else if children}{@render children()}{:else}{term}{/if}

<style>
  .term { text-decoration: underline dotted; text-underline-offset: 0.18em; cursor: help; }
</style>
