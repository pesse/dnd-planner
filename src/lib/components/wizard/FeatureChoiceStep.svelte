<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard, Job } from '../../services/wizard/characterWizard.svelte';
  import { optionLabel, type AnalysisChoice } from '../../services/analysis/types';
  import TooltipSelect, { type TooltipOption } from '../TooltipSelect.svelte';

  let { w, answers = $bindable(), statusText }: {
    w: CharacterWizard;
    answers: Record<string, string[]>;
    statusText: (job: Job<unknown>) => string;
  } = $props();

  function answerFor(id: string): string[] {
    return answers[id] ?? [];
  }
  function setSingleAnswer(id: string, value: string) {
    answers = { ...answers, [id]: [value] };
  }
  function setChoiceAnswer(id: string, values: string[]) {
    answers = { ...answers, [id]: values };
  }

  /**
   * WERT englisch, LABEL deutsch: der Wert geht an die KI zurück und an den Charakter, das
   * Label sieht der Spieler. Ohne Übersetzung steht Englisch da — bedienbar bleibt es.
   */
  function optionsFor(choice: AnalysisChoice): TooltipOption[] {
    return choice.options.map((o, i) => ({
      value: o,
      label: optionLabel(choice, i),
      tooltip: choice.optionHelpDe[o] || choice.optionHelp[o],
    }));
  }
</script>

<!-- Der KI-Status ist ein Banner, kein Entweder-oder: die deklarierten Wahlen
     (Zauber-Zugang eines Talents) stehen deterministisch und sofort da — auch ohne QM
     und während die Analyse noch läuft. -->
{#if w.analysis.status === 'running'}
  <p class="hint">Die KI analysiert die Merkmale … ({statusText(w.analysis)})</p>
{:else if w.analysis.status === 'skipped'}
  <p class="hint">Merkmals-Analyse übersprungen (kein QualityMinds-Modell aktiv). Merkmalsabhängige Wahlen kannst du später im Editor treffen.</p>
{:else if w.analysis.status === 'error'}
  <p class="warn">{statusText(w.analysis)}</p>
{/if}
{#if w.plainChoices.length === 0}
  {#if w.analysis.status === 'done' || w.analysis.status === 'skipped'}
    <p class="hint">
      Keine erzwungenen Merkmalswahlen auf Stufe 1.
      {#if w.spellPickChoices.length}Die Zauber-Wahl folgt im nächsten Schritt.{/if}
    </p>
  {/if}
{:else}
  {#each w.plainChoices as choice (choice.id)}
    <div class="field">
      <span>
        {choice.featureDe || choice.feature}: {choice.questionDe || choice.question}
        {#if choice.helpDe || choice.help}<span class="info" title={choice.helpDe || choice.help}>ⓘ</span>{/if}
      </span>
      {#if choice.type === 'text'}
        <input type="text" value={answerFor(choice.id)[0] ?? ''} oninput={(e) => setSingleAnswer(choice.id, e.currentTarget.value)} />
      {:else}
        <TooltipSelect
          options={optionsFor(choice)}
          selected={answerFor(choice.id)}
          multiple={choice.type === 'multiselect'}
          max={choice.type === 'multiselect' ? choice.max : 0}
          onchange={(v) => setChoiceAnswer(choice.id, v)}
        />
      {/if}
    </div>
  {/each}
{/if}
