<script lang="ts">
  /** Markdown-Ausgabe einer LLM-Antwort. */
  import { marked } from 'marked';

  let { text }: { text: string } = $props();
</script>

<div class="md-response">{@html marked(text)}</div>

<style>
  .md-response {
    font-size: 0.88rem;
    color: var(--ink);
    line-height: 1.6;
  }

  .md-response :global(h1) { color: var(--arcane); font-size: 1.05rem; font-weight: 700; margin: 0.5rem 0 0.3rem; }
  .md-response :global(h2) { color: var(--red); font-size: 0.95rem; font-weight: 700; margin: 0.75rem 0 0.25rem; }
  .md-response :global(h3) { color: var(--teal); font-size: 0.88rem; font-weight: 700; margin: 0.5rem 0 0.2rem; }
  .md-response :global(p) { margin: 0 0 0.5rem; }
  .md-response :global(p:last-child) { margin-bottom: 0; }
  .md-response :global(ul), .md-response :global(ol) { padding-left: 1.25rem; margin: 0 0 0.5rem; }
  .md-response :global(li) { margin-bottom: 0.15rem; }
  .md-response :global(code) { background: var(--surface); padding: 0.1em 0.35em; border-radius: 3px; font-family: monospace; font-size: 0.82em; }
  .md-response :global(pre) { background: var(--bg-deep); border-radius: 5px; padding: 0.5rem 0.7rem; overflow-x: auto; margin: 0 0 0.5rem; }
  .md-response :global(pre code) { background: none; padding: 0; font-size: 0.8rem; }
  .md-response :global(strong) { color: var(--danger); font-weight: 700; }
  .md-response :global(em) { color: var(--arcane); }
  .md-response :global(blockquote) { border-left: 3px solid var(--border); padding-left: 0.6rem; color: var(--ink-muted); margin: 0.4rem 0; font-style: italic; }
  .md-response :global(hr) { border: none; border-top: 1px solid var(--surface); margin: 0.6rem 0; }
</style>
