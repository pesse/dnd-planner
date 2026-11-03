<script lang="ts">
  import type { Monster } from '../types';
  import { monsterAlignmentLabel, monsterSizeLabel, monsterTypeLabel } from '../types';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../schemas/abilities';
  import { modStr } from '../domain/skills';
  import { crLabel, speedLine } from '../services/monsterFormat';
  import { monsterArtUrl } from '../libraryArt';
  import ArtFrame from './ui/ArtFrame.svelte';
  import { tipWheel } from '../utils/tipWheel';

  let { monster, x, y }: { monster: Monster | null; x: number; y: number } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));
  const withDetail = (value: number | string, detail?: string) => (detail ? `${value} (${detail})` : String(value));
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if monster}
  <div class="monster-tooltip" data-no-dice-refs style="left:{left}px;top:{top}px" bind:clientWidth={boxW} bind:clientHeight={boxH} use:tipWheel={monster}>
    <div class="tt-head">
      <div class="tt-title">
        <div class="tt-name">
          {monster.name}
          {#if monster.name_en && monster.name_en !== monster.name}<span class="tt-name-en">{monster.name_en}</span>{/if}
        </div>
        <div class="tt-meta">
          {monsterSizeLabel(monster.size)} {monsterTypeLabel(monster.type)} · {monsterAlignmentLabel(monster.alignment)}
        </div>
      </div>
      <ArtFrame src={monsterArtUrl(monster)} color="var(--red)" />
    </div>

    <div class="tt-section"><span class="tt-label">Herausforderung</span><span>{[`HG ${crLabel(monster.challenge_rating)}`, monster.xp ? `${monster.xp.toLocaleString('de-DE')} EP` : ''].filter(Boolean).join(' · ')}</span></div>
    <div class="tt-section"><span class="tt-label">Rüstungsklasse</span><span>{withDetail(monster.armor_class, monster.armor_detail)}</span></div>
    <div class="tt-section"><span class="tt-label">Trefferpunkte</span><span>{withDetail(monster.hit_points, monster.hit_dice)}</span></div>
    <div class="tt-section"><span class="tt-label">Bewegung</span><span>{speedLine(monster.speed)}</span></div>

    <div class="tt-divider"></div>
    <div class="tt-stats">
      {#each ABILITY_KEYS as key}
        <div><span class="tt-label">{ABILITY_ABBR_DE[key]}</span>{monster.ability_scores[key]} <span class="tt-mod">{modStr(monster.ability_scores[key])}</span></div>
      {/each}
    </div>

    {#if monster.traits.length || monster.actions.length}
      <div class="tt-divider"></div>
      {#if monster.traits.length}<div class="tt-section"><span class="tt-label">Merkmale</span><span>{monster.traits.map((t) => t.name).join(', ')}</span></div>{/if}
      {#if monster.actions.length}<div class="tt-section"><span class="tt-label">Aktionen</span><span>{monster.actions.map((a) => a.name).join(', ')}</span></div>{/if}
    {/if}
  </div>
{/if}

<style>
  .monster-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 200px;
    width: max-content;
    max-width: 320px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }
  .tt-head {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
  }
  .tt-title { flex: 1; min-width: 0; }
  .tt-name {
    font-weight: 600;
    font-size: 0.88rem;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.2rem;
  }
  .tt-name-en {
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-weight: 400;
    font-style: italic;
  }
  .tt-meta {
    font-size: 0.74rem;
    color: var(--red);
    margin-bottom: 0.45rem;
  }
  .tt-section {
    display: flex;
    gap: 0.5rem;
    font-size: 0.78rem;
    margin-bottom: 0.15rem;
    align-items: baseline;
  }
  .tt-label {
    color: var(--ink-muted);
    flex-shrink: 0;
    min-width: 70px;
    font-size: 0.72rem;
  }
  .tt-stats {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 0.1rem 0.8rem;
    font-size: 0.78rem;
  }
  .tt-stats .tt-label { min-width: 2.2rem; display: inline-block; }
  .tt-mod { color: var(--ink-muted); }
  .tt-divider { border-top: 1px solid var(--surface); margin: 0.45rem 0; }
</style>
