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

    <div class="vitals">
      <div><span class="k">RK</span><span class="v">{monster.armor_class}</span>{#if monster.armor_detail}<span class="d">{monster.armor_detail}</span>{/if}</div>
      <div><span class="k">TP</span><span class="v">{monster.hit_points}</span>{#if monster.hit_dice}<span class="d">{monster.hit_dice}</span>{/if}</div>
      <div><span class="k">HG</span><span class="v">{crLabel(monster.challenge_rating)}</span>{#if monster.xp}<span class="d">{monster.xp.toLocaleString('de-DE')} EP</span>{/if}</div>
    </div>
    <div class="tt-section"><span class="tt-label">Bewegung</span><span>{speedLine(monster.speed)}</span></div>

    <div class="abilities">
      {#each ABILITY_KEYS as key}
        <div>
          <span class="k">{ABILITY_ABBR_DE[key]}</span>
          <span class="v">{monster.ability_scores[key]}</span>
          <span class="d">{modStr(monster.ability_scores[key])}</span>
        </div>
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
  .vitals,
  .abilities {
    display: grid;
    text-align: center;
    border: 1px solid var(--surface);
    border-radius: 4px;
    margin: 0.1rem 0 0.45rem;
  }
  .vitals {
    grid-template-columns: repeat(3, 1fr);
  }
  .abilities {
    grid-template-columns: repeat(6, 1fr);
    margin: 0.45rem 0 0;
  }
  .vitals > div,
  .abilities > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.2rem;
  }
  .vitals > div + div,
  .abilities > div + div {
    border-left: 1px solid var(--surface);
  }
  .k {
    font-size: 0.66rem;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  .v {
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .d {
    font-size: 0.68rem;
    line-height: 1.2;
    color: var(--ink-muted);
  }
  .abilities .d {
    white-space: nowrap;
  }
</style>
