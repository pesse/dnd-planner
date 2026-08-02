<script lang="ts">
  /** Der Rahmen um das Bearbeiten-Formular einer Bibliothekskarte. */
  import type { Snippet } from 'svelte';

  let { accent, children }: { accent: string; children: Snippet } = $props();
</script>

<div class="edit-wrap" style="--mef-accent: {accent}">
  {@render children()}
</div>

<style>
  .edit-wrap {
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--mef-accent) 25%, var(--surface));
    border-radius: 6px; padding: 1rem 1.25rem; max-width: 560px; width: 100%;
  }
</style>
