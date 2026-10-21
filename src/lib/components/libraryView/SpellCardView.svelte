<script lang="ts">
  import type { Spell } from '$lib/types';
  import { spellLevelLabel, spellDesc, spellHigherLevel, spellComponents, SPELL_SCHOOLS, SPELL_CLASS_LABELS, labelOf } from '$lib/types';
  import { SCHOOL_COLORS } from '$lib/spellLibrary';
  import { spellArtUrl } from '$lib/libraryArt';
  import CardArt from '../ui/CardArt.svelte';
  import Markdown from '../Markdown.svelte';

  let { spell }: { spell: Spell } = $props();

  const higherLevel = $derived(spellHigherLevel(spell));
  const comps = $derived(spellComponents(spell));
  const pc = $derived(SCHOOL_COLORS[spell.school] ?? 'var(--ink-muted)');
</script>

<div class="spell-card" style="--c: {pc}">
  <div class="head">
    <CardArt src={spellArtUrl(spell)} color={pc} />
    <div class="name">
      {spell.name}{#if spell.ritual} <span class="ritual">Ritual</span>{/if}
    </div>
    <div class="meta">{spellLevelLabel(spell.level)} · {SPELL_SCHOOLS[spell.school] ?? spell.school}</div>
  </div>
  <div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>
  <div class="props">
    <div class="prop-row">
      <span class="pc"><span class="icon">⚡</span>{spell.casting_time}</span>
      <span class="pc"><span class="icon">◎</span>{spell.range}</span>
      <span class="pc"><span class="icon">⌛</span>{spell.duration.replace('Konzentration, ', 'Konz. ')}</span>
    </div>
    <div class="prop">
      <span class="icon">✦</span>
      <span>{comps}{#if spell.components.materials_needed} <span class="mat">({spell.components.materials_needed})</span>{/if}</span>
    </div>
  </div>
  <div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>
  <!-- Kein Splitting auf mehrere Karten: die Karte darf beliebig hoch werden, der
       Rahmen drumherum scrollt. Aufteilen ist allein eine Druck-Anforderung (printSpell.ts). -->
  <div class="desc"><Markdown source={spellDesc(spell)} /></div>
  {#if higherLevel}
    <div class="higher"><span class="higher-lbl">Auf höheren Graden.</span> <Markdown source={higherLevel} inline /></div>
  {/if}
  <div class="foot">
    <span>{spell.classes.map(c => labelOf(SPELL_CLASS_LABELS, c)).join(' · ')}</span>
  </div>
</div>

<style>
  .spell-card {
    width: 100%;
    max-width: 380px;
    background: var(--bg);
    border: 1.5px solid var(--gold);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 16px rgba(0,0,0,0.23);
    display: flex;
    flex-direction: column;
    color: var(--ink);
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    position: relative;
  }
  .spell-card::after {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid var(--gold);
    border-radius: 5px;
    pointer-events: none;
    z-index: 5;
  }

  .head {
    padding: 0.9rem 1.2rem 0.65rem;
    text-align: center;
    flex-shrink: 0;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--c) 55%, var(--bg)) 0%,
      color-mix(in srgb, var(--c) 10%, var(--bg)) 100%);
  }
  .name {
    font-size: 1.05rem;
    font-weight: 700;
    font-variant: small-caps;
    color: var(--ink);
    line-height: 1.2;
    letter-spacing: 0.02em;
  }
  .ritual {
    font-size: 0.58rem;
    font-weight: 700;
    font-variant: normal;
    background: var(--c);
    color: white;
    border-radius: 2px;
    padding: 1px 4px;
    vertical-align: middle;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .meta {
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--c) 80%, var(--ink));
    margin-top: 0.2rem;
    font-style: italic;
  }

  .orndiv {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 10px;
    flex-shrink: 0;
  }
  .ol {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .orndiv .ol:last-child {
    background: linear-gradient(to left, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .og {
    font-size: 0.65rem;
    color: var(--c);
    line-height: 1;
  }

  .props {
    padding: 0.45rem 1.1rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    line-height: 1.4;
  }
  .pc {
    display: inline;
    margin-right: 0.65rem;
  }
  .prop {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .icon {
    color: var(--c);
    flex-shrink: 0;
    width: 0.9rem;
    text-align: center;
    display: inline-block;
  }
  .mat {
    color: var(--ink-muted);
    font-style: italic;
  }

  .desc {
    padding: 0.55rem 1.1rem;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--ink);
  }

  .higher {
    padding: 0 1.1rem 0.55rem;
    font-size: 0.77rem;
    line-height: 1.45;
    color: var(--ink-soft);
  }
  .higher-lbl {
    font-weight: 700;
    color: var(--c);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 1.1rem;
    border-top: 1px solid var(--gold);
    background: color-mix(in srgb, var(--c) 6%, var(--bg));
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-style: italic;
    flex-shrink: 0;
  }
</style>
