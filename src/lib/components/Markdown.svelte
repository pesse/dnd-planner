<script lang="ts">
  import './ruleText.css';
  import { renderMarkdown, renderMarkdownInline, ruleText } from '../utils/markdown';

  let {
    source = '',
    inline = false,
  }: {
    /** Regeltext; ein Block-Array (Vault-Schemas) wird zusammengefügt. */
    source?: string | string[] | null;
    /** Kein Block-Element erzeugen — für Text, der in einer laufenden Zeile weitergeht. */
    inline?: boolean;
  } = $props();

  let text = $derived(ruleText(source));
  let html = $derived(inline ? renderMarkdownInline(text) : renderMarkdown(text));
</script>

{#if inline}
  <span class="md md-inline">{@html html}</span>
{:else}
  <div class="md">{@html html}</div>
{/if}
