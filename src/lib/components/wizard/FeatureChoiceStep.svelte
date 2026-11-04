<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { optionLabel, type AnalysisChoice } from '../../services/analysis/types';
  import TooltipSelect, { type TooltipOption } from '../TooltipSelect.svelte';
  import { textTip } from '../textTip.svelte';
  import LanguagePicker from '../LanguagePicker.svelte';
  import { isLanguageChoice } from '../../services/declaration/languages';

  let { w, answers = $bindable() }: {
    w: CharacterWizard;
    answers: Record<string, string[]>;
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

  /** Was eine andere Sprachwahl schon nimmt, ist hier nicht mehr wählbar. */
  function knownLanguagesFor(id: string): string[] {
    const others = w.plainChoices.filter((c) => c.id !== id && isLanguageChoice(c)).flatMap((c) => answerFor(c.id));
    return [...w.fixedLanguages, ...others];
  }

  /**
   * WERT englisch, LABEL deutsch: der Wert geht an den Charakter, das Label sieht der Spieler.
   * Ohne deutsche Deklaration steht Englisch da — bedienbar bleibt es.
   */
  function optionsFor(choice: AnalysisChoice): TooltipOption[] {
    return choice.options.map((o, i) => ({
      value: o,
      label: optionLabel(choice, i),
      tooltip: choice.optionHelpDe[o],
    }));
  }
</script>

{#each w.gaps as gap}
  <p class="warn">{gap}</p>
{/each}
{#if w.plainChoices.length === 0}
  <p class="hint">
    Keine erzwungenen Merkmalswahlen auf Stufe 1.
    {#if w.spellPickChoices.length}Die Zauber-Wahl folgt im nächsten Schritt.{/if}
  </p>
{:else}
  {#each w.plainChoices as choice (choice.id)}
    <div class="field">
      <span>
        {choice.featureDe || choice.feature}: {choice.questionDe || choice.question}
        {#if choice.helpDe}<span class="info" use:textTip={choice.helpDe}>ⓘ</span>{/if}
      </span>
      {#if isLanguageChoice(choice)}
        <LanguagePicker selected={answerFor(choice.id)} max={choice.max} known={knownLanguagesFor(choice.id)}
          onchange={(v) => setChoiceAnswer(choice.id, v)} />
      {:else if choice.type === 'text'}
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
