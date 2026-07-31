<script lang="ts">
  /**
   * EINE deklarierte Merkmalswahl am Charakter — nach dem Muster von `WeaponMasteryPicker`:
   * rein präsentierend, Props rein, Ereignisse raus, kein Bibliotheks- und kein
   * Charakterzugriff. Die Frage, die Antwort und die Wirkung beschafft der Aufrufer über
   * `services/characterChoices.ts`.
   *
   * „Übernehmen" statt Auto-Anwendung: die Wahl ändert Übungen, Zauber und Häkchen am Bogen,
   * und `applyChanges` ist additiv — ein Klick auf eine Option darf das nicht im Vorbeigehen
   * tun. Der Knopf erscheint nur, wenn die Changes am Bogen wirklich noch etwas ändern
   * würden; sonst sagt `hint`, warum nicht.
   *
   * `diff` blendet die globale Diff-Tönung selbst ein — eine `use:diffMark`-Action des
   * Aufrufers greift nicht in eine Kindkomponente.
   */
  import TooltipSelect, { type TooltipOption } from './TooltipSelect.svelte';
  import { optionLabel, type AnalysisChoice } from '../services/analysis/types';
  import type { DiffDir } from '../utils/diffHighlight';

  let {
    choice,
    answer,
    open,
    gainedAt,
    showLevel = false,
    pendingGrants = false,
    hint = '',
    flagged = [],
    diff = 'none',
    onchange,
    onapply,
  }: {
    choice: AnalysisChoice;
    /** Kanonische (englische) Werte; leer = offen. */
    answer: string[];
    open: boolean;
    /** Vergabe-Stufe — beschriftet die Zeile, wenn ein Merkmal mehrfach wählt. */
    gainedAt: number;
    showLevel?: boolean;
    pendingGrants?: boolean;
    hint?: string;
    /** Zaubernamen der Option ohne Bibliothekstreffer. */
    flagged?: string[];
    diff?: DiffDir;
    onchange: (next: string[]) => void;
    onapply: () => void;
  } = $props();

  const multiple = $derived(choice.type === 'multiselect');
  const options = $derived<TooltipOption[]>(
    choice.options.map((value, i) => ({
      value,
      label: optionLabel(choice, i),
      tooltip: choice.optionHelpDe[value] || choice.optionHelp[value] || '',
    })),
  );
  const label = $derived(choice.questionDe?.trim() || choice.question);
  const help = $derived(choice.helpDe?.trim() || choice.help);
</script>

<div class="choice" class:open class:diff-up={diff === 'up'} class:diff-down={diff === 'down'}>
  <div class="ch-head">
    <span class="ch-label">{label}</span>
    {#if showLevel}<span class="ch-lvl">Stufe {gainedAt}</span>{/if}
    {#if open}
      <span class="ch-open" title="Diese Wahl ist noch nicht getroffen">offen</span>
    {:else if multiple && choice.max > 1}
      <span class="ch-count" class:full={answer.length >= choice.max}>{answer.length} von {choice.max}</span>
    {/if}
  </div>

  <div class="ch-body">
    <div class="ch-select">
      <TooltipSelect
        {options}
        selected={answer}
        {multiple}
        max={choice.max}
        placeholder="— offen —"
        onchange={(next) => onchange(next)}
      />
    </div>
    {#if pendingGrants}
      <button type="button" class="ch-apply" title="Übungen, Häkchen und Zauber dieser Wahl in den Bogen eintragen"
        onclick={onapply}>Übernehmen</button>
    {/if}
  </div>

  {#if help}<p class="ch-help">{help}</p>{/if}
  {#if hint}<p class="ch-hint">{hint}</p>{/if}
  {#if flagged.length}
    <p class="ch-warn">Nicht in der Zauberbibliothek: {flagged.join(', ')} — bitte als Zauberkarte anlegen.</p>
  {/if}
</div>

<style>
  /* Dieselbe Kupfer-Box wie Grant- und Beherrschungs-Panel; Gold nur für „offen",
     die Sprache der Deklarations-Badges. */
  .choice {
    border: 1px solid color-mix(in srgb, var(--copper) 35%, var(--surface));
    border-radius: 5px; background: color-mix(in srgb, var(--copper) 6%, var(--bg-panel));
    padding: 0.4rem 0.55rem; margin: 0.3rem 0;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .choice.open {
    border-color: color-mix(in srgb, var(--gold) 45%, var(--bg));
    background: color-mix(in srgb, var(--gold) 8%, var(--bg-panel));
  }
  .ch-head { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .ch-label { font-size: 0.74rem; color: var(--copper); }
  .choice.open .ch-label { color: var(--gold); }
  .ch-lvl, .ch-count { font-size: 0.7rem; color: var(--ink-muted); }
  .ch-count.full { color: var(--copper); }
  .ch-open {
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--gold); border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    background: color-mix(in srgb, var(--gold) 12%, var(--bg)); border-radius: 3px;
    padding: 0.02rem 0.35rem;
  }
  .ch-body { display: flex; align-items: flex-start; gap: 0.4rem; }
  .ch-select { flex: 1 1 auto; min-width: 0; }
  .ch-apply {
    flex: 0 0 auto; background: var(--bg-panel); border: 1px solid var(--copper);
    border-radius: 5px; color: var(--copper); cursor: pointer; font: inherit;
    font-size: 0.76rem; padding: 0.4rem 0.6rem;
  }
  .ch-apply:hover { background: color-mix(in srgb, var(--copper) 20%, var(--bg-panel)); color: var(--ink); }
  .ch-help, .ch-hint { margin: 0; font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .ch-warn { margin: 0; font-size: 0.72rem; color: var(--danger); }
</style>
