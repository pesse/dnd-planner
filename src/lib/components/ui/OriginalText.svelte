<script lang="ts">
  /** Aufklappbarer englischer Originaltext neben der deutschen Fassung. */
  import type { Snippet } from 'svelte';

  let { text, children }: { text?: string; children?: Snippet } = $props();
</script>

<details class="orig-details">
  <summary>Original (EN)</summary>
  {#if children}
    {@render children()}
  {:else}
    <div class="orig-text">{text}</div>
  {/if}
</details>

<style>
  .orig-details { font-size: 0.78rem; }
  .orig-details summary { color: var(--border); cursor: pointer; }
  .orig-details summary:hover { color: var(--mef-accent, var(--arcane)); }

  .orig-text {
    background: var(--bg-deep); border: 1px solid var(--surface); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.8rem; line-height: 1.6;
    padding: 0.4rem 0.6rem; white-space: pre-wrap; font-style: italic; margin-top: 0.2rem;
  }
</style>
