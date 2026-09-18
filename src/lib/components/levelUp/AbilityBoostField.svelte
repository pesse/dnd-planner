<script lang="ts">
  /**
   * Die Tabellen-Attributsverbesserung als EIN Feld: Form der Erhöhung, Attribute und das
   * Ergebnis am Bogen. Kodiert wird die Wahl in `services/levelUp/asi.ts`.
   */
  import { untrack } from 'svelte';
  import { ABILITY_KEYS, ABILITY_LABEL } from '$lib/schemas/abilities';
  import { cappedScore } from '$lib/services/declaration/abilityIncrease';
  import {
    ASI_ABILITY_MAX, asiAnswer, asiIncrements, asiModeOf, readAsiPick, type AsiMode,
  } from '$lib/services/levelUp/asi';
  import type { LevelUpQuestion } from '$lib/schemas/levelUp';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui, q }: { ui: LevelUpAssistantUi; q: LevelUpQuestion } = $props();

  const MODES: { value: AsiMode; label: string }[] = [
    { value: 'plus2', label: '+2 auf ein Attribut' },
    { value: 'split', label: '+1 auf zwei Attribute' },
    { value: 'feat', label: 'Stattdessen ein Talent' },
  ];

  // Einmal beim Öffnen gelesen: der Checkpoint kann nach einem Fehler erneut anliegen, dann
  // steht die Antwort schon da und die Bedienform muss zu ihr passen.
  const startAnswer = untrack(() => ui.answerList(q.id));
  const startPick = readAsiPick(startAnswer);
  const startAbilities = startPick?.kind === 'abilities' ? startPick.abilities : [];
  const startMode = asiModeOf(startAnswer);
  let mode = $state<AsiMode | ''>(startMode);
  let first = $state<string>(startAbilities[0] ?? '');
  let second = $state<string>(startMode === 'split' ? (startAbilities[1] ?? '') : '');

  const commit = () => ui.setList(q.id, asiAnswer(mode, first, second));

  function setMode(next: AsiMode) {
    mode = next;
    commit();
  }

  function setFirst(value: string) {
    first = value;
    if (second === value) second = '';
    commit();
  }

  function setSecond(value: string) {
    second = value;
    commit();
  }

  // Die laufende Auswahl, nicht die fertige Antwort: in „+1 auf zwei" steht das Ergebnis
  // des ersten Attributs schon da, während das zweite noch offen ist.
  const chosen = $derived<string[]>(
    mode === 'plus2' ? (first ? [first, first] : [])
    : mode === 'split' ? [first, second].filter(Boolean)
    : [],
  );
  const lines = $derived(
    asiIncrements(chosen).map((inc) => {
      const before = ui.abilityBefore(inc.ability);
      const after = cappedScore(before, inc.value, ASI_ABILITY_MAX);
      return { label: ABILITY_LABEL[inc.ability], value: inc.value, before, after, capped: after < before + inc.value };
    }),
  );
</script>

<div class="boost">
  <div class="group-chips">
    {#each MODES as m}
      <button type="button" class="group-chip" class:on={mode === m.value} onclick={() => setMode(m.value)}>{m.label}</button>
    {/each}
  </div>

  {#if mode === 'feat'}
    <span class="field-hint">Das Talent wählst du im nächsten Schritt aus der Bibliothek; die Attribute bleiben unverändert.</span>
  {:else if mode}
    <div class="row two">
      <select class="select" value={first} onchange={(e) => setFirst((e.target as HTMLSelectElement).value)}>
        <option value="">— Attribut wählen —</option>
        {#each ABILITY_KEYS as k}<option value={k}>{ABILITY_LABEL[k]}</option>{/each}
      </select>
      {#if mode === 'split'}
        <select class="select" value={second} disabled={!first} onchange={(e) => setSecond((e.target as HTMLSelectElement).value)}>
          <option value="">— zweites Attribut —</option>
          {#each ABILITY_KEYS.filter((k) => k !== first) as k}<option value={k}>{ABILITY_LABEL[k]}</option>{/each}
        </select>
      {/if}
    </div>
    {#each lines as l}
      <span class="result" class:capped={l.capped}>
        {l.label} +{l.value}: {l.before} → <strong>{l.after}</strong>{#if l.capped} (Maximum {ASI_ABILITY_MAX}){/if}
      </span>
    {/each}
  {/if}
</div>

<style>
  .boost { display: flex; flex-direction: column; gap: 0.4rem; }
  .result { font-size: 0.82rem; color: var(--ink-soft); }
  .result.capped { color: var(--gold, #c89b3c); }
</style>
