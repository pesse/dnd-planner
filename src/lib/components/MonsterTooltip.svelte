<script lang="ts">
  import type { Monster } from '../types';
  import { monsterAlignmentLabel, monsterSizeLabel, monsterTypeLabel } from '../types';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../schemas/abilities';
  import { modStr } from '../domain/skills';
  import { crLabel, speedLine } from '../services/monsterFormat';
  import { monsterArtUrl } from '../libraryArt';
  import ArtFrame from './ui/ArtFrame.svelte';
  import TooltipFrame from './ui/TooltipFrame.svelte';

  let { monster, x, y }: { monster: Monster | null; x: number; y: number } = $props();

  const withDetail = (value: number | string, detail?: string) => (detail ? `${value} (${detail})` : String(value));
</script>

{#if monster}
  <TooltipFrame {x} {y} content={monster}>
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
  </TooltipFrame>
{/if}

<style>
  .tt-stats {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 0.1rem 0.8rem;
    font-size: 0.78rem;
  }
  .tt-stats .tt-label { min-width: 2.2rem; display: inline-block; }
  .tt-mod { color: var(--ink-muted); }
</style>
