<script lang="ts">
  import type { Snippet } from 'svelte';
  import { glossaryTip } from '$lib/services/glossaryTip';
  import { textTip } from './textTip.svelte';

  let { term, children }: {
    /** Glossar-Stichwort, z.B. „Trefferpunktewürfel" für die Anzeige „Trefferwürfel". */
    term: string;
    children?: Snippet;
  } = $props();

  let tip = $state<string | null>(null);
  $effect(() => {
    const t = term;
    let live = true;
    void glossaryTip(t).then((text) => { if (live) tip = text; });
    return () => { live = false; };
  });
</script>

{#if tip}
  <span class="term" use:textTip={tip}>{#if children}{@render children()}{:else}{term}{/if}</span>
{:else if children}{@render children()}{:else}{term}{/if}

<style>
  .term { text-decoration: underline dotted; text-underline-offset: 0.18em; cursor: help; }
</style>
