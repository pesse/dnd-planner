<script lang="ts">
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
  import './form.css';

  let {
    ac = $bindable(), initiative = $bindable(), speed = $bindable(),
    hitDice = $bindable(), hpMax = $bindable(), hpCurrent = $bindable(), hpTemp = $bindable(),
    proficiencyBonus = $bindable(), saved, dirOf,
  }: {
    ac: string; initiative: string; speed: string; hitDice: string;
    hpMax: string; hpCurrent: string; hpTemp: string;
    proficiencyBonus: number;
    saved?: Character | null;
    dirOf: (old: unknown, now: unknown) => DiffDir;
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

<div class="grid-3">
  <label use:diffMark={dirOf(saved?.ac, ac)}>RK<input bind:value={ac} placeholder="15" /></label>
  <label use:diffMark={dirOf(saved?.initiative, initiative)}>Initiative<input bind:value={initiative} placeholder="+2" /></label>
  <label use:diffMark={dirOf(saved?.speed, speed)}>Bewegung (m)
    <input inputmode="decimal" value={speed} oninput={onSpeedInput} placeholder="9" />
  </label>
  <label use:diffMark={dirOf(saved?.hitDice, hitDice)}>Trefferwürfel<input bind:value={hitDice} placeholder="5W10" /></label>
  <label use:diffMark={dirOf(saved?.hpMax, hpMax)}>TP Maximum<input bind:value={hpMax} placeholder="45" /></label>
  <label use:diffMark={dirOf(saved?.hpCurrent, hpCurrent)}>TP Aktuell<input bind:value={hpCurrent} placeholder="45" /></label>
  <label use:diffMark={dirOf(saved?.hpTemp, hpTemp)}>Temp. TP<input bind:value={hpTemp} placeholder="0" /></label>
  <label use:diffMark={dirOf(saved?.proficiencyBonus, proficiencyBonus)}>Übungsbonus
    <input type="number" bind:value={proficiencyBonus} min="2" max="6" />
  </label>
</div>
