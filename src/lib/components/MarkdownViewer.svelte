<script lang="ts">
  import { marked } from 'marked';
  import { fileContent } from '../stores/campaign';
  import { stripFrontmatter } from '../utils/frontmatter';
</script>

<div class="viewer">
  {@html marked(stripFrontmatter($fileContent))}
</div>

<style>
  .viewer {
    flex: 1;
    padding: 1.5rem 2rem;
    overflow-y: auto;
    color: #cdd6f4;
    line-height: 1.8;
  }

  .viewer :global(h1) { color: #cba6f7; font-size: 1.8rem; margin-bottom: 0.5rem; }
  .viewer :global(h2) { color: #89b4fa; font-size: 1.4rem; margin-top: 1.5rem; }
  .viewer :global(h3) { color: #94e2d5; font-size: 1.1rem; margin-top: 1rem; }
  .viewer :global(code) { background: #313244; padding: 0.1em 0.4em; border-radius: 4px; font-family: monospace; }
  .viewer :global(strong) { color: #f38ba8; }
  .viewer :global(p) { margin: 0 0 1rem; }
  .viewer :global(ul), .viewer :global(ol) { padding-left: 1.5rem; margin-bottom: 1rem; }
  .viewer :global(li) { margin-bottom: 0.25rem; }
</style>
