<script lang="ts">
  import './sheet.css';
  import { sign } from '../../utils/num';
  import { effectiveProficiencyBonus } from '../../services/classProgression';
  import { MASTERY_INFO, masteryLabel } from '../../itemLabels';
  import { textTip } from '../textTip.svelte';
  import GlossaryTerm from '../GlossaryTerm.svelte';
  import {
    attackBonusPartsTip, attackBonusTip, attackDamagePartsTip, attackDamageTip,
  } from '../../services/characterSheetTips';
  import {
    attackBaseDice, attackBonusParts, attackDamageParts, computeAttackBonus, computeAttackDamage, type AttackCalcContext,
  } from '../../services/attackCalc';
  import type { WeaponMastery } from '../../schemas/vocabulary';
  import type { Character } from '../../schemas/characterSchema';
  import type { CombatTips } from '../../services/characterSheetTips';
  import { ownWeaponNotes, type AttackFootnote } from '../../services/attackEffects';
  import { attackFootnoteHtml, attackOriginIcon, attackOriginLegend, attackOriginOf } from '../../services/attackOrigin';

  let { character, tips, masteryOf, hpTipHtml, acTipHtml, attackCtx, attackNotes }: {
    character: Character;
    tips: CombatTips;
    masteryOf: (name: string) => WeaponMastery | undefined;
    /** Leer, solange die Bibliotheken laden. */
    hpTipHtml: string;
    /** Leer, solange die Bibliotheken laden. */
    acTipHtml: string;
    /** null, solange Bibliotheken und Merkmale laden — dann stehen die gespeicherten Werte. */
    attackCtx: AttackCalcContext | null;
    /** Leer ohne erweiterten Bereich. */
    attackNotes: AttackFootnote[];
  } = $props();

  const ownNotes = $derived(character.attacks.map((a) => ownWeaponNotes(a, attackCtx?.declared)));
  const legend = $derived(attackOriginLegend([
    ...character.attacks.map(attackOriginOf),
    ...ownNotes.flat().map((n) => n.origin),
    ...attackNotes.map((n) => n.origin),
  ]));
</script>

{#snippet stat(label: string, value: string, tipHtml: string)}
  <div class="stat" class:has-tip={tipHtml}>
    <span class="sl">{label}</span><span class="sv">{value}</span>
    {#if tipHtml}<span class="tip">{@html tipHtml}</span>{/if}
  </div>
{/snippet}

<div class="section">
  <h3>Kampf</h3>
  <div class="stats-grid">
    <div class="stat" class:has-tip={acTipHtml}>
      <span class="sl">RK</span><span class="sv">{character.ac || '—'}</span>
      {#if acTipHtml}<span class="tip">{@html acTipHtml}</span>{/if}
    </div>
    {@render stat('Initiative', tips.initiativeAdvantage ? `${character.initiative} V` : character.initiative, tips.initiative)}
    {@render stat('Bewegung', character.speed ? `${character.speed} m` : '—', tips.speed)}
    <div class="stat" class:has-tip={hpTipHtml}>
      <span class="sl">TP max</span><span class="sv">{character.hpMax || '—'}</span>
      {#if hpTipHtml}<span class="tip">{@html hpTipHtml}</span>{/if}
    </div>
    {@render stat('TP aktuell', character.hpCurrent || '—', tips.hpCurrent)}
    <div class="stat"><span class="sl">Temp. TP</span><span class="sv">{character.hpTemp || '—'}</span></div>
    <div class="stat"><span class="sl">Trefferwürfel</span><span class="sv">{character.hitDice}</span></div>
    {@render stat('Übungsbonus', sign(effectiveProficiencyBonus(character)), tips.proficiencyBonus)}
    <div class="stat"><span class="sl">Passiv Wahr.</span><span class="sv">{character.passivePerception}</span></div>
    <div class="stat">
      <span class="sl"><GlossaryTerm term="Heldische Inspiration">Inspiration</GlossaryTerm></span>
      <span class="sv">{character.heroicInspiration ? '✦' : '—'}</span>
    </div>
    {#if character.exhaustion > 0}
      <div class="stat"><span class="sl"><GlossaryTerm term="Erschöpfung" /></span><span class="sv">{character.exhaustion}</span></div>
    {/if}
  </div>

  {#if character.attacks.length}
    <h3>Angriffe</h3>
    <table class="attack-table">
      <thead><tr><th>Angriff</th><th>Bonus</th><th>Schaden</th><th>RW</th></tr></thead>
      <tbody>
        {#each character.attacks as atk, i}
          {@const atkMastery = masteryOf(atk.name)}
          {@const calc = atk.auto && attackCtx}
          {@const bonus = calc ? computeAttackBonus(atk, calc) : atk.bonus}
          {@const damage = calc ? computeAttackDamage(atk, calc) : atk.damage}
          {@const dice = calc ? attackBaseDice(atk, calc) : ''}
          {@const origin = attackOriginOf(atk)}
          <tr>
            <td>
              {#if origin}{@html attackOriginIcon(origin)}{/if}{atk.name}
              {#if atkMastery}
                <span class="mastery-tag" use:textTip={MASTERY_INFO[atkMastery].descDe}>{masteryLabel(atkMastery)}</span>
              {/if}
              {#if atk.note?.trim()}
                <span class="attack-note">{atk.note}</span>
              {/if}
              {#each ownNotes[i] ?? [] as n (n.text)}
                <span class="attack-note">{@html attackFootnoteHtml(n)}</span>
              {/each}
            </td>
            <td class="has-tip">
              {bonus}
              <span class="tip tip-left">{@html calc
                ? attackBonusPartsTip(attackBonusParts(atk, calc), bonus)
                : attackBonusTip(atk.bonus)}</span>
            </td>
            <td class="has-tip">
              {damage} {atk.type}
              <span class="tip tip-left">{@html calc && dice
                ? attackDamagePartsTip(attackDamageParts(atk, calc), dice, damage, atk.type)
                : attackDamageTip(damage, atk.type)}</span>
            </td>
            <td>{atk.range || '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#each attackNotes as note (note.text)}<p class="attack-footnote">{@html attackFootnoteHtml(note)}</p>{/each}
    {#if legend}<p class="attack-legend">{@html legend}</p>{/if}
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
  .attack-footnote { margin: 0.3rem 0.3rem 0; font-size: 0.75rem; color: var(--ink-muted); }
  .attack-footnote :global(b) { color: var(--ink-soft); }
  .attack-legend { margin: 0.4rem 0.3rem 0; font-size: 0.7rem; color: var(--ink-faint); text-align: right; }
  .section :global(.atk-origin) { display: inline-block; width: 0.9em; margin-right: 0.3rem; vertical-align: -0.1em; color: var(--ink-muted); }
  .section :global(.atk-origin svg) { display: block; }
  .section :global(.atk-origin-spell) { color: var(--arcane); }

  .attack-note {
    display: block;
    font-size: 0.68rem;
    font-style: italic;
    color: var(--ink-muted);
  }

  /* Waffenbeherrschung: kleine Pille hinter dem Angriffsnamen. */
  .mastery-tag {
    display: inline-block; margin-left: 0.3rem;
    border: 1px solid color-mix(in srgb, var(--copper) 45%, transparent);
    border-radius: 99px; padding: 0 0.35rem;
    font-size: 0.65rem; color: var(--copper); cursor: help; vertical-align: middle;
  }
</style>
