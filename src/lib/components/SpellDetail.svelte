<script lang="ts">
  /** Zauber-Steckbrief — im Tooltip wie im Detail-Popup derselbe. */
  import type { Spell } from '../types';
  import { SPELL_SCHOOLS, spellLevelLabel, spellDesc, spellHigherLevel, spellComponents } from '../types';
  import { SCHOOL_COLORS } from '../spellLibrary';
  import { spellArtUrl } from '../libraryArt';
  import Markdown from './Markdown.svelte';
  import ArtFrame from './ui/ArtFrame.svelte';

  let { spell }: { spell: Spell } = $props();

  const color = $derived(SCHOOL_COLORS[spell.school] ?? 'var(--arcane)');
  const desc = $derived(spellDesc(spell));
  const higher = $derived(spellHigherLevel(spell));
  const art = $derived(spellArtUrl(spell));
</script>

<div class="spell-detail" style="--sc:{color}">
  <div class="tt-head">
    <div class="tt-title">
      <div class="tt-name">
        {spell.name}
        {#if spell.ritual}<span class="tt-badge tt-ritual">Ritual</span>{/if}
      </div>
      <div class="tt-meta">{spellLevelLabel(spell.level)} · {SPELL_SCHOOLS[spell.school] ?? spell.school}</div>
    </div>
    <ArtFrame src={art} color={color} />
  </div>

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

<style>
  .tt-head {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
  }
  .tt-title { flex: 1; min-width: 0; }

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
