<script lang="ts">
  import { ruleText } from '$lib/rulesLibrary';
  import { RULE_CATEGORY_DE, type Rule } from '$lib/schemas/rule';
  import { sourceLabel } from '$lib/schemas/source';
  import LibraryCardFrame from '../ui/LibraryCardFrame.svelte';
  import Markdown from '../Markdown.svelte';

  let { rule }: { rule: Rule } = $props();

  const desc = $derived(ruleText(rule));
</script>

<LibraryCardFrame accent="var(--ink-soft)" name={rule.name} nameDe={rule.nameDe}>
  {#snippet head()}
    <div class="badges">
      <span class="kategorie">{RULE_CATEGORY_DE[rule.category]}</span>
      <span class="kategorie">{sourceLabel(rule.source)}</span>
    </div>
  {/snippet}
  {#if desc}
    <div class="body"><Markdown source={desc} /></div>
  {:else}
    <p class="empty">Keine Beschreibung.</p>
  {/if}
</LibraryCardFrame>

<style>
  .badges {
    display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; margin-top: 0.35rem;
  }
  .kategorie {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-soft); border: 1px solid color-mix(in srgb, var(--ink-soft) 45%, var(--bg));
    border-radius: 3px; padding: 0.05rem 0.4rem;
  }

  .body { padding: 0.7rem 1.2rem 1rem; font-size: 0.85rem; line-height: 1.55; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }
</style>
