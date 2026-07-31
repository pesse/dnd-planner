<script lang="ts">
  /** Werkzeugleiste unter dem Bearbeiten-Formular einer Bibliothekskarte. */
  import type { Snippet } from 'svelte';

  let {
    accent,
    actions,
    children,
  }: {
    /** Farbe, in der die Knöpfe beim Überfahren anspringen. */
    accent: string;
    actions: { label: string; onclick: () => void }[];
    children?: Snippet;
  } = $props();
</script>

<div class="ai-section" style="--tools-accent: {accent}">
  <span class="ai-label">Werkzeuge</span>
  <div class="ai-row">
    {#each actions as action}
      <button class="ai-btn" onclick={action.onclick}>{action.label}</button>
    {/each}
  </div>
  {@render children?.()}
</div>

<style>
  .ai-section {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.45rem;
    width: 100%; max-width: 560px; margin-top: 0.6rem; padding-top: 0.6rem;
    border-top: 1px solid var(--surface);
  }
  .ai-section :global(.dnd-api-search) { width: 100%; }
  .ai-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
  .ai-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ai-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.82rem; font-family: inherit;
  }
  .ai-btn:hover { border-color: var(--tools-accent); color: var(--tools-accent); }
</style>
