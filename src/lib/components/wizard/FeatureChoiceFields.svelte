<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { optionLabel, type AnalysisChoice } from '../../services/analysis/types';
  import TooltipSelect, { type TooltipOption } from '../TooltipSelect.svelte';
  import { textTip } from '../textTip.svelte';
  import LanguagePicker from '../LanguagePicker.svelte';
  import { isLanguageChoice } from '../../services/declaration/languages';

  /** `withFeature`: neben dem Talent, um das es geht, wäre sein Name nur Wiederholung. */
  let { w, choices, withFeature = true }: { w: CharacterWizard; choices: AnalysisChoice[]; withFeature?: boolean } = $props();

  const answerFor = (id: string): string[] => w.choiceAnswers[id] ?? [];
  function setAnswer(id: string, values: string[]) {
    w.choiceAnswers = { ...w.choiceAnswers, [id]: values };
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

{#each choices as choice (choice.id)}
  <div class="field">
    <span>
      {withFeature ? `${choice.featureDe || choice.feature}: ` : ''}{choice.questionDe || choice.question}
      {#if choice.helpDe}<span class="info" use:textTip={choice.helpDe}>ⓘ</span>{/if}
    </span>
    {#if isLanguageChoice(choice)}
      <LanguagePicker selected={answerFor(choice.id)} max={choice.max} known={knownLanguagesFor(choice.id)}
        onchange={(v) => setAnswer(choice.id, v)} />
    {:else if choice.type === 'text'}
      <input type="text" value={answerFor(choice.id)[0] ?? ''} oninput={(e) => setAnswer(choice.id, [e.currentTarget.value])} />
    {:else}
      <TooltipSelect
        options={optionsFor(choice)}
        selected={answerFor(choice.id)}
        multiple={choice.type === 'multiselect'}
        max={choice.type === 'multiselect' ? choice.max : 0}
        onchange={(v) => setAnswer(choice.id, v)}
      />
    {/if}
  </div>
{/each}
