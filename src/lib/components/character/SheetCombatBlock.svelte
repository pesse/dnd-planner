<script lang="ts">
  import './sheet.css';
  import { sign } from '../../utils/num';
  import { MASTERY_INFO, masteryLabel } from '../../itemLabels';
  import { attackBonusTip, attackDamageTip } from '../../services/characterSheetTips';
  import type { WeaponMastery } from '../../schemas/vocabulary';
  import type { Character } from '../../schemas/characterSchema';

  let { character, masteryOf }: {
    character: Character;
    masteryOf: (name: string) => WeaponMastery | undefined;
  } = $props();
</script>

<div class="section">
  <h3>Kampf</h3>
  <div class="stats-grid">
    <div class="stat"><span class="sl">RK</span><span class="sv">{character.ac}</span></div>
    <div class="stat"><span class="sl">Initiative</span><span class="sv">{character.initiative}</span></div>
    <div class="stat"><span class="sl">Bewegung</span><span class="sv">{character.speed}m</span></div>
    <div class="stat"><span class="sl">TP max</span><span class="sv">{character.hpMax}</span></div>
    <div class="stat"><span class="sl">TP aktuell</span><span class="sv">{character.hpCurrent || '—'}</span></div>
    <div class="stat"><span class="sl">Temp. TP</span><span class="sv">{character.hpTemp || '—'}</span></div>
    <div class="stat"><span class="sl">Trefferwürfel</span><span class="sv">{character.hitDice}</span></div>
    <div class="stat"><span class="sl">Übungsbonus</span><span class="sv">{sign(character.proficiencyBonus)}</span></div>
    <div class="stat"><span class="sl">Passiv Wahr.</span><span class="sv">{character.passivePerception}</span></div>
  </div>

  {#if character.attacks.length}
    <h3>Angriffe</h3>
    <table class="attack-table">
      <thead><tr><th>Waffe</th><th>Bonus</th><th>Schaden</th><th>RW</th></tr></thead>
      <tbody>
        {#each character.attacks as atk}
          {@const atkMastery = masteryOf(atk.name)}
          <tr>
            <td>
              {atk.name}
              {#if atkMastery}
                <span class="mastery-tag" title={MASTERY_INFO[atkMastery].descDe}>{masteryLabel(atkMastery)}</span>
              {/if}
            </td>
            <td class="has-tip">
              {atk.bonus}
              <span class="tip tip-left">{@html attackBonusTip(atk.bonus)}</span>
            </td>
            <td class="has-tip">
              {atk.damage} {atk.type}
              <span class="tip tip-left">{@html attackDamageTip(atk.damage, atk.type)}</span>
            </td>
            <td>{atk.range || '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .attack-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .attack-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.15rem 0.3rem;
    border-bottom: 1px solid var(--surface);
  }
  .attack-table td { padding: 0.15rem 0.3rem; color: var(--ink); }

  /* Waffenbeherrschung: kleine Pille hinter dem Angriffsnamen. */
  .mastery-tag {
    display: inline-block; margin-left: 0.3rem;
    border: 1px solid color-mix(in srgb, var(--copper) 45%, transparent);
    border-radius: 99px; padding: 0 0.35rem;
    font-size: 0.65rem; color: var(--copper); cursor: help; vertical-align: middle;
  }
</style>
