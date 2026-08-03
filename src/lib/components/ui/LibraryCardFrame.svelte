<script lang="ts">
  /**
   * Der Rahmen einer Bibliothekskarte: Umriss, Kopfverlauf und das Namenspaar.
   * Alles Weitere kommt aus den Snippets — die Akzentfarbe ist der einzige Unterschied.
   */
  import type { Snippet } from 'svelte';

  let { accent, name = '', nameDe = '', head, children }: {
    accent: string;
    name?: string;
    nameDe?: string;
    /** Zusatzzeilen im Kopf, unter dem Namen. */
    head?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="lib-card" style="--card-accent: {accent}">
  <div class="head">
    <div class="name">{nameDe || name}</div>
    {#if nameDe && name && nameDe !== name}
      <div class="name-en">{name}</div>
    {/if}
    {@render head?.()}
  </div>
  {@render children()}
</div>

<style>
  .lib-card {
    width: 100%; max-width: 560px; background: var(--bg);
    border: 1.5px solid var(--card-accent); border-radius: 8px;
    color: var(--ink); font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    overflow: hidden;
  }
  .head {
    padding: 0.9rem 1.2rem; text-align: center;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--card-accent) 40%, var(--bg)) 0%,
      color-mix(in srgb, var(--card-accent) 8%, var(--bg)) 100%);
  }
  .name { font-size: 1.3rem; font-weight: 700; font-variant: small-caps; letter-spacing: 0.02em; }
  .name-en { font-size: 0.85rem; font-style: italic; color: var(--ink-soft); }
</style>
