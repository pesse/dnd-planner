<script lang="ts">
  import './levelUp.css';
  import { hasAnswer } from '$lib/services/levelUp/answers';
  import type { LevelUpQuestion } from '$lib/schemas/levelUp';
  import type { LevelUpAssistantUi } from './assistantState.svelte';
  import SpellPickField from '../SpellPickField.svelte';
  import FeatureChoicePicker from '../FeatureChoicePicker.svelte';

  let { ui, list }: { ui: LevelUpAssistantUi; list: LevelUpQuestion[] } = $props();
  const st = $derived(ui.st);
</script>

<div class="questions">
  {#each list as q (q.id)}
    {@const choice = ui.choices.analysisById.get(q.id)}
    {#if choice && (q.type === 'choice' || q.type === 'multiselect')}
      <FeatureChoicePicker
        {choice}
        answer={ui.answerList(q.id)}
        open={!hasAnswer(st.answers[q.id])}
        gainedAt={st.delta?.toLevel ?? 0}
        onchange={(next) => ui.setAnswerList(q, next)}
        onapply={() => {}}
      />
    {:else}
      <div class="row">
        <span class="field-label">{q.prompt}{#if !q.required}<span class="field-hint"> (optional)</span>{/if}</span>
        {#if q.help}<span class="field-hint">{q.help}</span>{/if}
        {#if q.type === 'number'}
          <input class="input" type="number" min={q.min} max={q.max} value={st.answers[q.id] as string} oninput={(e) => ui.setIn(q.id, (e.target as HTMLInputElement).value)} />
        {:else if q.type === 'spell-picker'}
          {@const bind = ui.pickBinding(q.id)}
          <SpellPickField
            title={q.prompt}
            library={st.spellLib}
            spellLevels={q.spellLevels}
            spellClass={q.spellClass}
            max={q.max ?? 1}
            known={ui.run.knownSpells.except(q.id)}
            bind:picks={bind[0], bind[1]}
            allowCreate
            onCreate={(name, levels) => ui.openSpellCreator(name, levels, q.id)}
          />
        {:else}
          <textarea class="textarea" rows="2" value={st.answers[q.id] as string} oninput={(e) => ui.setIn(q.id, (e.target as HTMLTextAreaElement).value)}></textarea>
        {/if}
      </div>
    {/if}
  {/each}
</div>
