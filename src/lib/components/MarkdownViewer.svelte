<script lang="ts">
  import { fileContent } from '../stores/campaign';

  // Einfaches Markdown-Rendering ohne externe Deps (wird später durch unified ersetzt)
  function renderMarkdown(md: string): string {
    return md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[h|p|u|o])(.+)$/gm, '<p>$1</p>');
  }
</script>

<div class="viewer">
  {@html renderMarkdown($fileContent)}
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
</style>
