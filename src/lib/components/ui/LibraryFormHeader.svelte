<script lang="ts">
  /** Kopf eines Bibliotheks-Formulars: beide Namen plus eine Zeile Metafelder. */
  import type { Snippet } from 'svelte';

  let {
    nameDe = $bindable(),
    name = $bindable(),
    onchange,
    meta,
    children,
  }: {
    nameDe: string | undefined;
    name: string | undefined;
    onchange: () => void;
    meta: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="sb-header">
  <input class="ef sb-name" bind:value={nameDe} oninput={onchange} placeholder="Deutscher Name" />
  <input class="ef sb-name-en" bind:value={name} oninput={onchange} placeholder="Name (EN)" />
  <div class="meta-row">{@render meta()}</div>
  {@render children?.()}
</div>

<style>
  .sb-header { margin-bottom: 0.4rem; display: flex; flex-direction: column; gap: 0.15rem; }
  .sb-name {
    font-size: 1.3rem; font-weight: 700; color: var(--mef-accent, var(--arcane));
    font-variant: small-caps; width: 100%;
  }
  .sb-name-en { font-size: 0.85rem; color: var(--ink-soft); font-style: italic; width: 100%; }

  .meta-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.3rem; }
  .meta-row :global(.key-input) {
    font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--ink-muted); min-width: 160px;
  }
</style>
