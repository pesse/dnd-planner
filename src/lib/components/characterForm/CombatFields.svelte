<script lang="ts">
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
  import type { CombatFallbacks } from '../../services/combatFallbacks';
  import type { CombatTips } from '../../services/characterSheetTips';
  import './form.css';

  let {
    ac = $bindable(), initiative = $bindable(), speed = $bindable(),
    hitDice = $bindable(), hpMax = $bindable(), hpCurrent = $bindable(), hpTemp = $bindable(),
    proficiencyBonus = $bindable(), fallbacks, tips, saved, dirOf, hpTipHtml = '', acTipHtml = '',
  }: {
    ac: string; initiative: string; speed: string; hitDice: string;
    hpMax: string; hpCurrent: string; hpTemp: string;
    proficiencyBonus: number | null;
    /** Stehen als Platzhalter in leeren Feldern; der Bogen zeigt sie an deren Stelle. */
    fallbacks: CombatFallbacks;
    tips: CombatTips;
    saved?: Character | null;
    dirOf: (old: unknown, now: unknown) => DiffDir;
    /** Leer, solange die Bibliotheken laden. */
    hpTipHtml?: string;
    /** Leer, solange die Bibliotheken laden. */
    acTipHtml?: string;
  } = $props();

  /**
   * Bewegungsrate ist eine Meterzahl, kein Freitext. Das Schema-Feld bleibt ein String
   * (PDF-Grenze), die Eingabe wird auf Ziffern plus EIN Komma reduziert.
   */
  function cleanSpeed(raw: string): string {
    const [head, ...rest] = raw.replace(/[^\d.,]/g, '').replace(/\./g, ',').split(',');
    return rest.length ? `${head},${rest.join('')}` : head;
  }
  function onSpeedInput(e: Event & { currentTarget: HTMLInputElement }) {
    const cleaned = cleanSpeed(e.currentTarget.value);
    // Verwirft die Eingabe den getippten Rest, muss das DOM-Feld mitgezogen werden — der
    // reaktive Wert allein ändert sich dabei nicht und Svelte würde nichts schreiben.
    if (cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned;
    speed = cleaned;
  }
</script>

<div class="combat-grid">
  <label class="stat" use:diffMark={dirOf(saved?.ac, ac)} class:has-tip={acTipHtml}>RK<input bind:value={ac} placeholder={String(fallbacks.ac ?? '')} />
    {#if acTipHtml}<span class="tip">{@html acTipHtml}</span>{/if}
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.initiative, initiative)} class:has-tip={tips.initiative}>Initiative
    <input bind:value={initiative} placeholder={fallbacks.initiative} />
    {#if tips.initiative}<span class="tip">{@html tips.initiative}</span>{/if}
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.speed, speed)} class:has-tip={tips.speed}>Bewegung (m)
    <input inputmode="decimal" value={speed} oninput={onSpeedInput} placeholder={fallbacks.speed} />
    {#if tips.speed}<span class="tip">{@html tips.speed}</span>{/if}
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.proficiencyBonus, proficiencyBonus)} class:has-tip={tips.proficiencyBonus}>Übungsbonus
    <input type="number" bind:value={proficiencyBonus}
      placeholder={String(fallbacks.proficiencyBonus)} min="2" max="6" />
    {#if tips.proficiencyBonus}<span class="tip">{@html tips.proficiencyBonus}</span>{/if}
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.hpCurrent, hpCurrent)} class:has-tip={tips.hpCurrent}>TP aktuell<input bind:value={hpCurrent} placeholder={hpMax} />
    {#if tips.hpCurrent}<span class="tip">{@html tips.hpCurrent}</span>{/if}
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.hpMax, hpMax)} class:has-tip={hpTipHtml}>TP max<input bind:value={hpMax} placeholder="45" />
    {#if hpTipHtml}<span class="tip">{@html hpTipHtml}</span>{/if}
  </label>
  <label class="stat" use:diffMark={dirOf(saved?.hpTemp, hpTemp)}>Temp. TP<input bind:value={hpTemp} placeholder="0" /></label>
  <label class="stat" use:diffMark={dirOf(saved?.hitDice, hitDice)}>Trefferwürfel<input bind:value={hitDice} placeholder="5W10" /></label>
</div>

<style>
  .combat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(4.5rem, 6rem));
    gap: 0.4rem;
  }
  .stat {
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
</style>
