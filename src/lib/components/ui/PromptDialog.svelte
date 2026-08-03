<script lang="ts">
  /**
   * Rahmen der wartenden Abfrage-Dialoge: Backdrop, Kasten, Titel, Knopfleiste.
   */
  import type { Snippet } from 'svelte';

  let {
    title,
    accent = 'var(--red)',
    maxWidth = '420px',
    titleGap = '0.5rem',
    onbackdrop,
    children,
    actions,
  }: {
    title: string;
    accent?: string;
    maxWidth?: string;
    /** Abstand zwischen Titel und Inhalt. */
    titleGap?: string;
    onbackdrop: () => void;
    children: Snippet;
    actions: Snippet;
  } = $props();

  const style = $derived(`--pd-accent: ${accent}; --pd-max-w: ${maxWidth}; --pd-title-gap: ${titleGap};`);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="overlay" onclick={onbackdrop}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="dialog" {style} onclick={(e) => e.stopPropagation()}>
    <h3>{title}</h3>
    {@render children()}
    <div class="actions">{@render actions()}</div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: var(--bg-raised);
    border: 1px solid var(--pd-accent);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    max-width: var(--pd-max-w);
    width: 90%;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    color: var(--ink);
  }

  h3 {
    margin: 0 0 var(--pd-title-gap);
    font-size: 1rem;
    color: var(--gold);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .actions :global(button) {
    border-radius: 4px;
    padding: 0.35rem 0.9rem;
    cursor: pointer;
    font-size: 0.82rem;
    font-family: inherit;
  }
</style>
