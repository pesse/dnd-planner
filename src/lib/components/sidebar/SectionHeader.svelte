<script lang="ts">
  import type { Snippet } from 'svelte';
  import './tree.css';

  let { label, expanded, ontoggle, top = false, actions }: {
    label: string;
    expanded: boolean;
    ontoggle: () => void;
    /** Oberste Ebene (Charaktere, Bibliotheken) — weniger Einzug als eine Kampagnen-Sektion. */
    top?: boolean;
    actions?: Snippet;
  } = $props();
</script>

<div class="section-row">
  <button class="section-toggle" class:chars-toggle={top} onclick={ontoggle}>
    <span class="arrow" class:open={expanded}>›</span>
    {label}
  </button>
  {@render actions?.()}
</div>
