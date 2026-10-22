<script lang="ts">
  import './levelUp.css';
  import SpellPickField from '../SpellPickField.svelte';
  import AbilityBoostField from './AbilityBoostField.svelte';
  import HpDecision from './HpDecision.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
  const hpRoll = $derived(st.decisions.find((q) => q.type === 'hp-roll'));
</script>

{#if st.decisions.length === 0}
  <p class="hint">Keine offenen Entscheidungen — direkt zum Vorschlag.</p>
{/if}
<div class="questions">
  {#each st.decisions.filter((q) => q.type !== 'hp-roll') as q (q.id)}
    <section class="decision">
      <h3>{q.prompt}{#if !q.required}<span class="hint"> (optional)</span>{/if}</h3>
      {#if q.help}<p class="hint">{q.help}</p>{/if}
      {#if q.id === 'hp_method'}
        <HpDecision {ui} method={q} roll={hpRoll} />
      {:else if q.type === 'ability-boost'}
        <AbilityBoostField {ui} {q} />
      {:else if q.type === 'choice'}
        <div class="chips" role="radiogroup" aria-label={q.prompt}>
          {#each q.options as opt}
            <button type="button" role="radio" aria-checked={st.answers[q.id] === opt.value} class="chip" class:sel={st.answers[q.id] === opt.value} onclick={() => ui.setIn(q.id, opt.value)}>{opt.label}</button>
          {/each}
        </div>
      {:else if q.type === 'multiselect'}
        <div class="chips">
          {#each q.options as opt}
            <button type="button" class="chip" class:sel={(st.answers[q.id] as string[])?.includes(opt.value)} onclick={() => ui.toggleIn(q.id, opt.value, q.max)}>{opt.label}</button>
          {/each}
        </div>
      {:else if q.type === 'number'}
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
    </section>
  {/each}
</div>
