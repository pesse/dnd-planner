<script lang="ts">
  import './levelUp.css';
  import { hasAnswer } from '$lib/services/levelUp/answers';
  import { isLanguageChoice } from '$lib/services/declaration/languages';
  import { splitChoiceAnswer } from '$lib/services/declaration/source';
  import type { LevelUpQuestion } from '$lib/schemas/levelUp';
  import type { LevelUpAssistantUi } from './assistantState.svelte';
  import SpellPickField from '../SpellPickField.svelte';
  import FeatureChoicePicker from '../FeatureChoicePicker.svelte';
  import Markdown from '../Markdown.svelte';

  let { ui, list }: { ui: LevelUpAssistantUi; list: LevelUpQuestion[] } = $props();
  const st = $derived(ui.st);

  // Ein Merkmal mit mehreren Wahlen (Expertise UND Sprachen) zeigt seinen Regeltext einmal.
  const groups = $derived.by(() => {
    const byKey = new Map<string, LevelUpQuestion[]>();
    for (const q of list) byKey.set(q.featureKey || q.id, [...(byKey.get(q.featureKey || q.id) ?? []), q]);
    return [...byKey.values()].map((qs) => {
      const labels = qs.flatMap((q) => {
        const c = ui.choices.analysisById.get(q.id);
        return c ? [...c.options, ...c.optionsDe] : [];
      });
      return { qs, note: ui.choices.featureNoteOf(qs[0].featureKey, labels) };
    });
  });

  const answerOf = (q: LevelUpQuestion): string[] =>
    q.type === 'text' ? splitChoiceAnswer((st.answers[q.id] as string) ?? '') : ui.answerList(q.id);

  // Was eine andere Sprachwahl dieses Aufstiegs schon nimmt, ist hier nicht mehr wählbar.
  const knownLanguagesFor = (id: string): string[] => [
    ...(ui.character.languages ?? []),
    ...list
      .filter((q) => {
        const c = ui.choices.analysisById.get(q.id);
        return q.id !== id && !!c && isLanguageChoice(c);
      })
      .flatMap(answerOf),
  ];

  /** „Geschickte Erkundung: Wähle 2 Sprachen" → „Wähle 2 Sprachen" unter der Merkmalsüberschrift. */
  const withoutFeature = (prompt: string, featureName: string | undefined): string =>
    featureName && prompt.startsWith(`${featureName}: `) ? prompt.slice(featureName.length + 2) : prompt;
</script>

<div class="questions">
  {#each groups as { qs, note } (qs[0].id)}
    <section class="q-group" class:framed={!!note}>
      {#if note}
        <h3>{note.titleDe}</h3>
        <details class="q-note" open>
          <summary>Regeltext</summary>
          <Markdown source={note.text} />
        </details>
      {/if}
      {#each qs as q (q.id)}
        {@const choice = ui.choices.analysisById.get(q.id)}
        {#if choice && (q.type === 'choice' || q.type === 'multiselect' || q.type === 'text')}
          <FeatureChoicePicker
            {choice}
            title={withoutFeature(choice.questionDe?.trim() || choice.question, note?.titleDe)}
            answer={answerOf(q)}
            open={!hasAnswer(st.answers[q.id])}
            gainedAt={st.delta?.toLevel ?? 0}
            knownLanguages={knownLanguagesFor(q.id)}
            onchange={(next) => ui.setAnswerList(q, next)}
            onapply={() => {}}
          />
        {:else}
          <div class="field">
            <span>{withoutFeature(q.prompt, note?.titleDe)}{#if !q.required}<span class="hint"> (optional)</span>{/if}</span>
            {#if q.help}<span class="hint">{q.help}</span>{/if}
            {#if q.type === 'number'}
              <input type="number" min={q.min} max={q.max} value={st.answers[q.id] as string} oninput={(e) => ui.setIn(q.id, (e.target as HTMLInputElement).value)} />
            {:else if q.type === 'spell-picker'}
              {@const bind = ui.pickBinding(q.id)}
              <SpellPickField
                title={q.prompt}
                library={st.spellLib}
                spellLevels={q.spellLevels}
                spellClass={q.spellClass}
                spellSchools={q.spellSchools}
                max={q.max ?? 1}
                known={ui.run.knownSpells.except(q.id)}
                bind:picks={bind[0], bind[1]}
                allowCreate
                onCreate={(name, levels) => ui.openSpellCreator(name, levels, q.id)}
              />
            {:else}
              <textarea rows="2" value={st.answers[q.id] as string} oninput={(e) => ui.setIn(q.id, (e.target as HTMLTextAreaElement).value)}></textarea>
            {/if}
          </div>
        {/if}
      {/each}
    </section>
  {/each}
</div>

<style>
  .q-group { display: flex; flex-direction: column; gap: 0.35rem; }
  .q-group.framed { border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.8rem 0.7rem; background: var(--surface); }
  .q-group h3 {
    margin: 0; font-family: var(--font-display); font-size: 0.88rem; letter-spacing: 0.07em;
    text-transform: uppercase; color: var(--gold);
  }
  .q-note { font-size: 0.72rem; color: var(--ink-muted); }
  .q-note summary { color: var(--copper); cursor: pointer; }
  .q-note :global(.md) { margin-top: 0.25rem; }
</style>
