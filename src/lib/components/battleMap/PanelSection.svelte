<script lang="ts">
  /** Ein einklappbarer Abschnitt der linken Cockpit-Seite. */
  import type { Snippet } from 'svelte';

  let { title, open = true, actions, children }: { title: string; open?: boolean; actions?: Snippet; children: Snippet } = $props();
</script>

<details {open}>
  <summary>
    <span class="title">{title}</span>
    {#if actions}
      <!-- Ein Klick auf eine Aktion soll den Abschnitt nicht zuklappen. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <span class="actions" onclick={(e) => e.preventDefault()}>{@render actions()}</span>
    {/if}
  </summary>
  <div class="body">{@render children()}</div>
</details>

<style>
  details {
    border-bottom: 1px solid var(--surface);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    list-style: none;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    user-select: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: '▸';
    font-size: 0.7rem;
  }
  details[open] > summary::before {
    content: '▾';
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 0.2rem;
    text-transform: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0 0.75rem 0.6rem;
  }
</style>
