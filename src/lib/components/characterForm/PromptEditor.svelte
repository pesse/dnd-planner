<script lang="ts">
  /** Ein Bild-Prompt, der den Merkmalen folgt, bis man ihn von Hand ändert. */
  import type { Snippet } from 'svelte';

  let { generated, edited = $bindable(), busy, maxChars, head }: {
    generated: string;
    /** `null` = der Prompt folgt `generated`; sonst die Handfassung. */
    edited: string | null;
    busy: boolean;
    maxChars?: number;
    head?: Snippet;
  } = $props();

  const prompt = $derived(edited ?? generated);
</script>

<div class="prompt">
  <span class="prompt-head">
    Prompt
    {#if edited !== null}
      <em>von Hand geändert – Merkmale wirken nicht mehr</em>
      <button class="btn-add" onclick={() => { edited = null; }} disabled={busy}>Zurücksetzen</button>
    {/if}
    {@render head?.()}
    <span class="count" class:over={!!maxChars && prompt.length > maxChars}>
      {prompt.length}{maxChars ? ` / ${maxChars}` : ''} Zeichen
    </span>
  </span>
  <textarea rows="6" value={prompt} disabled={busy}
    aria-label="Prompt" oninput={(e) => { edited = e.currentTarget.value; }}></textarea>
</div>

<style>
  .prompt { display: flex; flex-direction: column; gap: 0.2rem; margin-top: 0.7rem; font-size: 0.8rem; }
  .prompt-head { display: flex; align-items: center; gap: 0.5rem; }
  .prompt-head :global(em) { font-size: 0.7rem; color: var(--ink-muted); }
  .count { margin-left: auto; font-size: 0.7rem; color: var(--ink-muted); }
  .count.over { color: var(--danger); font-weight: 700; }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; font-size: 0.75rem; }
</style>
