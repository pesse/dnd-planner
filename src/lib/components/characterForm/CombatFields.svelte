<script lang="ts">
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
  import type { CombatFallbacks } from '../../services/combatFallbacks';
  import type { CombatTips } from '../../services/characterSheetTips';
  import type { CharacterFormFields } from '../../services/characterFormFields';
  import './form.css';

  let { form, fallbacks, tips, saved, dirOf, hpTipHtml = '', acTipHtml = '' }: {
    form: CharacterFormFields;
    fallbacks: CombatFallbacks;
    tips: CombatTips;
    saved?: Character | null;
    dirOf: (old: unknown, now: unknown) => DiffDir;
    /** Leer, solange die Bibliotheken laden. */
    hpTipHtml?: string;
    /** Leer, solange die Bibliotheken laden. */
    acTipHtml?: string;
  } = $props();

  const orDash = (n: number | null): string => (n === null ? '—' : String(n));
  const hpMax = $derived(form.hpMax.trim() || orDash(fallbacks.hpMax));
  const speed = $derived(form.speed.trim() || fallbacks.speed);
</script>

{#snippet computed(label: string, stored: string, value: string, tipHtml: string)}
  <div class="stat" class:has-tip={tipHtml}>
    {label}
    <span class="value" class:legacy={stored.trim()}>{value}</span>
    {#if tipHtml}<span class="tip">{@html tipHtml}</span>{/if}
  </div>
{/snippet}

<div class="combat-grid">
  {@render computed('RK', form.ac, form.ac.trim() || orDash(fallbacks.ac), acTipHtml)}
  {@render computed('Initiative', form.initiative, form.initiative.trim() || fallbacks.initiative, tips.initiative)}
  {@render computed('Bewegung', form.speed, speed ? `${speed} m` : '—', tips.speed)}
  <label class="stat" use:diffMark={dirOf(saved?.proficiencyBonus, form.proficiencyBonus)} class:has-tip={tips.proficiencyBonus}>Übungsbonus
    <input type="number" bind:value={form.proficiencyBonus}
      placeholder={String(fallbacks.proficiencyBonus)} min="2" max="6" />
    {#if tips.proficiencyBonus}<span class="tip">{@html tips.proficiencyBonus}</span>{/if}
  </label>
  {@render computed('TP max', form.hpMax, hpMax, hpTipHtml)}
  <label class="stat" use:diffMark={dirOf(saved?.hpDiceTotal, form.hpDiceTotal ?? undefined)}
    title="Summe aller Trefferwürfel, Stufe 1 mit Maximum, ohne KON und Boni je Stufe">Würfelsumme
    <input type="number" min="1" bind:value={form.hpDiceTotal} placeholder="—" />
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.hpCurrent, form.hpCurrent)} class:has-tip={tips.hpCurrent}>TP aktuell<input bind:value={form.hpCurrent} placeholder={hpMax} />
    {#if tips.hpCurrent}<span class="tip">{@html tips.hpCurrent}</span>{/if}
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.hpTemp, form.hpTemp)}>Temp. TP<input bind:value={form.hpTemp} placeholder="0" /></label>
  <label class="stat" use:diffMark={dirOf(saved?.hitDice, form.hitDice)}>Trefferwürfel<input bind:value={form.hitDice} placeholder="5W10" /></label>
</div>

<style>
  .combat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(4.5rem, 6rem));
    gap: 0.4rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    background: var(--surface);
    border-radius: 6px;
    padding: 0.3rem 0.4rem 0.4rem;
    align-items: center;
    text-align: center;
    font-size: 0.68rem;
    color: var(--ink-muted);
  }
  .stat input {
    width: 100%;
    text-align: center;
    font-size: 0.95rem;
    font-weight: 600;
    background: var(--bg);
  }
  .value {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--arcane);
    padding: 0.25rem 0;
  }
  .value.legacy { color: var(--copper); }
</style>
