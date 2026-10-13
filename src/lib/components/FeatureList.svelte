<script lang="ts" module>
  export interface FeatureListEntry {
    id: string;
    name: string;
    text: string;
    /** Ordnet die Gruppe; ohne Stufe steht das Merkmal oben bei den offenen. */
    level?: number;
    /** Zusatz neben dem Namen, z.B. „Stufe 4, 8, 12" oder „Unterklasse". */
    note?: string;
  }
</script>

<script lang="ts">
  import Markdown from './Markdown.svelte';

  let { entries, openUpTo = 1, accent = 'var(--copper)' }: {
    entries: FeatureListEntry[];
    /** Merkmale bis zu dieser Stufe stehen ausgeschrieben, spätere je Stufe eingeklappt. */
    openUpTo?: number;
    accent?: string;
  } = $props();

  const open = $derived(entries.filter((e) => (e.level ?? 0) <= openUpTo));
  const later = $derived.by(() => {
    const byLevel = new Map<number, FeatureListEntry[]>();
    for (const e of entries) {
      if ((e.level ?? 0) <= openUpTo) continue;
      byLevel.set(e.level!, [...(byLevel.get(e.level!) ?? []), e]);
    }
    return [...byLevel.entries()].sort(([a], [b]) => a - b);
  });
</script>

{#snippet feature(e: FeatureListEntry)}
  <div class="feature">
    <div class="feature-head">
      <span class="feature-name">{e.name}</span>
      {#if e.note}<span class="feature-note">{e.note}</span>{/if}
    </div>
    {#if e.text}<div class="feature-desc"><Markdown source={e.text} /></div>{/if}
  </div>
{/snippet}

<div class="feature-list" style="--fl-accent: {accent}">
  {#each open as e (e.id)}{@render feature(e)}{/each}
  {#each later as [level, group] (level)}
    <details class="level">
      <summary>
        <span class="level-label">Stufe {level}</span>
        <span class="level-names">{group.map((e) => e.name).join(' · ')}</span>
      </summary>
      <div class="level-body">
        {#each group as e (e.id)}{@render feature(e)}{/each}
      </div>
    </details>
  {/each}
</div>

<style>
  .feature-list { display: flex; flex-direction: column; gap: 0.7rem; }
  .feature-head { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
  .feature-name { font-weight: 700; font-variant: small-caps; color: var(--fl-accent); }
  .feature-note { font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .feature-desc { font-size: 0.85rem; line-height: 1.55; margin-top: 0.15rem; }
  .level { border-top: 1px solid var(--border); padding-top: 0.4rem; }
  summary {
    cursor: pointer; display: flex; gap: 0.6rem; align-items: baseline; list-style: none;
    font-size: 0.85rem;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▸'; color: var(--fl-accent); }
  .level[open] > summary::before { content: '▾'; }
  .level-label { font-weight: 700; color: var(--fl-accent); white-space: nowrap; }
  .level-names { color: var(--ink-soft); }
  .level-body { display: flex; flex-direction: column; gap: 0.7rem; padding: 0.5rem 0 0 1rem; }
</style>
