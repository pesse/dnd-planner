<script lang="ts">
  import type { Spell } from '../types';
  import { SPELL_SCHOOLS, spellLevelLabel, spellDesc, spellHigherLevel, spellComponents } from '../types';
  import { SCHOOL_COLORS } from '../spellLibrary';
  import Markdown from './Markdown.svelte';

  let { spell, x, y }: { spell: Spell | null; x: number; y: number } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  // x/y ist der vom Aufrufer bereits gesetzte Anker (Cursor + Offset), wie
  // beim Item-Tooltip. Am Viewport-Rand klappen wir um/begrenzen, damit lange
  // Zauberbeschreibungen nicht abgeschnitten werden.
  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top  = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));

</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if spell}
  {@const color = SCHOOL_COLORS[spell.school] ?? 'var(--arcane)'}
  {@const desc = spellDesc(spell)}
  {@const higher = spellHigherLevel(spell)}
  <div
    class="spell-tooltip"
    style="left:{left}px;top:{top}px;--sc:{color}"
    bind:clientWidth={boxW}
    bind:clientHeight={boxH}
  >
    <div class="tt-name">
      {spell.name}
      {#if spell.ritual}<span class="tt-badge tt-ritual">Ritual</span>{/if}
    </div>
    <div class="tt-meta">{spellLevelLabel(spell.level)} · {SPELL_SCHOOLS[spell.school] ?? spell.school}</div>

    <div class="tt-props">
      <span class="tt-label">Zauberdauer</span><span class="tt-pval">{spell.casting_time}</span>
      <span class="tt-label">Reichweite</span><span class="tt-pval">{spell.range}</span>
      <span class="tt-label">Komponenten</span><span class="tt-pval">{spellComponents(spell)}{spell.components.materials_needed ? ` (${spell.components.materials_needed})` : ''}</span>
      <span class="tt-label">Dauer</span><span class="tt-pval">{spell.duration}</span>
    </div>

    {#if desc}
      <div class="tt-divider"></div>
      <div class="tt-desc"><Markdown source={desc} /></div>
    {/if}
    {#if higher}
      <div class="tt-divider"></div>
      <div class="tt-higher"><span class="higher-lbl">Auf höheren Graden.</span> <Markdown source={higher} inline /></div>
    {/if}
  </div>
{/if}

<style>
  .spell-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--sc);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 220px;
    max-width: 360px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }

  .tt-name {
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--sc);
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.2rem;
  }
  .tt-badge {
    font-size: 0.68rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-weight: 500;
    line-height: 1.4;
  }
  .tt-ritual {
    background: color-mix(in srgb, var(--sc) 13%, transparent);
    color: var(--sc);
    border: 1px solid color-mix(in srgb, var(--sc) 25%, transparent);
  }
  .tt-meta {
    font-size: 0.74rem;
    color: var(--ink-muted);
    font-style: italic;
    margin-bottom: 0.45rem;
  }

  .tt-props {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    gap: 0.15rem 0.5rem;
    font-size: 0.78rem;
  }
  .tt-label {
    color: var(--ink-muted);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    align-self: start;
    padding-top: 0.05rem;
  }
  .tt-pval { color: var(--ink); line-height: 1.4; }

  .tt-divider { border-top: 1px solid var(--surface); margin: 0.45rem 0; }

  .tt-desc {
    font-size: 0.77rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .tt-higher {
    font-size: 0.76rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .higher-lbl { color: var(--sc); font-weight: 700; margin-right: 0.3rem; }
</style>
