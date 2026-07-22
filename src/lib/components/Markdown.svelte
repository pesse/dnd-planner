<script lang="ts">
  import { marked } from 'marked';

  let { source = '' }: { source?: string } = $props();

  let html = $derived(marked.parse(source ?? '', { async: false }) as string);
</script>

<div class="md">{@html html}</div>

<style>
  .md :global(p) { margin: 0 0 0.5rem; }
  .md :global(p:first-child) { margin-top: 0; }
  .md :global(p:last-child) { margin-bottom: 0; }
  .md :global(ul), .md :global(ol) { margin: 0.3rem 0; padding-left: 1.3rem; }
  .md :global(li) { margin-bottom: 0.15rem; }
  .md :global(li:last-child) { margin-bottom: 0; }
  .md :global(strong) { font-weight: 700; }
  .md :global(em) { font-style: italic; }
  .md :global(code) {
    background: var(--surface); padding: 0.05em 0.3em;
    border-radius: 3px; font-family: monospace; font-size: 0.9em;
  }
  .md :global(h1), .md :global(h2), .md :global(h3),
  .md :global(h4), .md :global(h5), .md :global(h6) {
    font-size: 1em; font-weight: 700; margin: 0.4rem 0 0.2rem;
  }
  .md :global(a) { color: var(--arcane); }
  .md :global(blockquote) {
    margin: 0.3rem 0; padding-left: 0.7rem;
    border-left: 2px solid var(--border); color: var(--ink-soft);
  }
  .md :global(table) {
    border-collapse: collapse; margin: 0.4rem 0; font-size: 0.95em;
  }
  .md :global(th), .md :global(td) {
    border: 1px solid var(--border); padding: 0.2rem 0.5rem; text-align: left;
  }
  .md :global(th) { background: var(--surface); font-weight: 700; }
</style>
