<script lang="ts">
  import Markdown from '../Markdown.svelte';
  import { getMonsterLore, loreText, type MonsterLoreHit } from '../../monsterLoreLibrary';

  let { path }: { path: string } = $props();

  const slug = $derived(path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, ''));

  let hit = $state<MonsterLoreHit | null>(null);
  $effect(() => {
    const s = slug;
    let cancelled = false;
    hit = null;
    void getMonsterLore(s).then((h) => { if (!cancelled) hit = h ?? null; });
    return () => { cancelled = true; };
  });
</script>

{#if hit}
  {@const { family, entry } = hit}
  <section class="lore">
    <header>
      <h3>{loreText(family.name, family.nameDe)}</h3>
      {#if family.tagline}<span class="tagline">{loreText(family.tagline, family.taglineDe)}</span>{/if}
    </header>
    {#if family.habitat || family.treasure}
      <p class="meta">
        {#if family.habitat}<span><b>Lebensraum:</b> {loreText(family.habitat, family.habitatDe)}</span>{/if}
        {#if family.treasure}<span><b>Schatz:</b> {loreText(family.treasure, family.treasureDe)}</span>{/if}
      </p>
    {/if}
    {#if entry.intro}<div class="own"><Markdown source={loreText(entry.intro, entry.introDe)} /></div>{/if}
    <Markdown source={loreText(family.intro, family.introDe)} />
  </section>
{/if}

<style>
  .lore {
    margin-top: 0.8rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-raised);
    color: var(--ink-soft);
    font-size: 0.88rem;
  }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.7rem; }
  h3 { margin: 0; font-family: var(--font-display); color: var(--red); font-size: 1.05rem; }
  .tagline { font-style: italic; color: var(--ink-muted); }
  .meta { display: flex; flex-wrap: wrap; gap: 0.2rem 1.2rem; margin: 0.4rem 0 0.6rem; font-size: 0.8rem; }
  .meta b { color: var(--ink); font-weight: 600; }
  .own { color: var(--ink); }
  .lore :global(blockquote) {
    margin: 0.6rem 0;
    padding: 0.2rem 0.8rem;
    border-left: 3px solid var(--gold);
    font-style: italic;
  }
  .lore :global(table) { border-collapse: collapse; margin: 0.4rem 0 0.8rem; font-size: 0.82rem; }
  .lore :global(th), .lore :global(td) { border-bottom: 1px solid var(--surface); padding: 0.2rem 0.5rem; text-align: left; vertical-align: top; }
</style>
