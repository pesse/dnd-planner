<script lang="ts">
  import './levelUp.css';
  import SpellPickField from '../SpellPickField.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
</script>

{#if st.decisions.length === 0}
  <p class="hint">Keine offenen Entscheidungen — direkt zum Vorschlag.</p>
{/if}
<div class="questions">
  {#each st.decisions as q (q.id)}
    <div class="row">
      <span class="field-label">{q.prompt}{#if !q.required}<span class="field-hint"> (optional)</span>{/if}</span>
      {#if q.help}<span class="field-hint">{q.help}</span>{/if}
      {#if q.type === 'choice'}
        <select class="select" value={st.answers[q.id] as string} onchange={(e) => ui.setIn(q.id, (e.target as HTMLSelectElement).value)}>
          {#each q.options as opt}<option value={opt.value}>{opt.label}</option>{/each}
        </select>
      {:else if q.type === 'multiselect'}
        <div class="group-chips">
          {#each q.options as opt}
            <button type="button" class="group-chip" class:on={(st.answers[q.id] as string[])?.includes(opt.value)} onclick={() => ui.toggleIn(q.id, opt.value, q.max)}>{opt.label}</button>
          {/each}
        </div>
      {:else if q.type === 'number'}
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
      {:else if q.type === 'hp-roll'}
        {#if st.answers['hp_method'] === 'roll'}
          <div class="roll">
            <button type="button" class="secondary-btn" onclick={() => ui.rollHp(q)}>🎲 {ui.hpRolls[q.id]?.length ? 'Neu würfeln' : 'Würfeln'}</button>
            {#if ui.hpRolls[q.id]?.length}
              <span class="roll-result">{ui.hpRolls[q.id].join(' + ')} = <strong>{st.answers[q.id]}</strong> (+ KON je Stufe)</span>
            {:else}
              <span class="field-hint">Noch nicht gewürfelt.</span>
            {/if}
          </div>
        {:else}
          <span class="field-hint">„Durchschnitt" gewählt — kein Wurf nötig.</span>
        {/if}
      {:else}
        <textarea class="textarea" rows="2" value={st.answers[q.id] as string} oninput={(e) => ui.setIn(q.id, (e.target as HTMLTextAreaElement).value)}></textarea>
      {/if}
    </div>
  {/each}
</div>
