<script lang="ts">
  import type { Snippet } from 'svelte';
  import './tree.css';

  let { label, expanded, ontoggle, onlabel, current = false, top = false, actions }: {
    label: string;
    expanded: boolean;
    ontoggle: () => void;
    /** Gesetzt: nur der Pfeil klappt auf, das Label öffnet stattdessen dies. */
    onlabel?: () => void;
    current?: boolean;
    /** Oberste Ebene (Charaktere, Bibliotheken) — weniger Einzug als eine Kampagnen-Sektion. */
    top?: boolean;
    actions?: Snippet;
  } = $props();
</script>

<div class="section-row">
  {#if onlabel}
    <div class="section-toggle split" class:chars-toggle={top} class:current>
      <button class="tree-arrow" onclick={ontoggle} aria-label={expanded ? 'Zuklappen' : 'Aufklappen'}>
        <span class="arrow" class:open={expanded}>›</span>
      </button>
      <button class="tree-label" onclick={onlabel}>{label}</button>
    </div>
  {:else}
    <button class="section-toggle" class:chars-toggle={top} onclick={ontoggle}>
      <span class="arrow" class:open={expanded}>›</span>
      {label}
    </button>
  {/if}
  {@render actions?.()}
</div>
