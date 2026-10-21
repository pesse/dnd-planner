<script lang="ts">
  /**
   * Die Tabellen-Attributsverbesserung als EIN Feld: Form der Erhöhung, Attribute und das
   * Ergebnis am Bogen. Kodiert wird die Wahl in `services/levelUp/asi.ts`.
   */
  import { untrack } from 'svelte';
  import { ABILITY_ABBR_DE, ABILITY_KEYS, ABILITY_LABEL, type AbilityKey } from '$lib/schemas/abilities';
  import { cappedScore } from '$lib/services/declaration/abilityIncrease';
  import {
    ASI_ABILITY_MAX, asiAnswer, asiIncrements, asiModeOf, readAsiPick, type AsiMode,
  } from '$lib/services/levelUp/asi';
  import type { LevelUpQuestion } from '$lib/schemas/levelUp';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui, q }: { ui: LevelUpAssistantUi; q: LevelUpQuestion } = $props();

  const MODES: { value: AsiMode; label: string; sub: string }[] = [
    { value: 'plus2', label: '+2', sub: 'auf ein Attribut' },
    { value: 'split', label: '+1 / +1', sub: 'auf zwei Attribute' },
    { value: 'feat', label: 'Talent', sub: 'statt der Erhöhung' },
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
    if (next === 'plus2') second = '';
    commit();
  }

  /** Bei „+1 / +1" verdrängt ein drittes Attribut das zuerst gewählte. */
  function pick(k: AbilityKey) {
    if (mode === 'plus2') first = k;
    else if (first === k) [first, second] = [second, ''];
    else if (second === k) second = '';
    else if (!first) first = k;
    else if (!second) second = k;
    else [first, second] = [second, k];
    commit();
  }

  // Die laufende Auswahl, nicht die fertige Antwort: in „+1 auf zwei" steht das Ergebnis
  // des ersten Attributs schon da, während das zweite noch offen ist.
  const chosen = $derived<string[]>(
    mode === 'plus2' ? (first ? [first, first] : [])
    : mode === 'split' ? [first, second].filter(Boolean)
    : [],
  );
  const tiles = $derived.by(() => {
    const inc = new Map(asiIncrements(chosen).map((i) => [i.ability, i.value]));
    return ABILITY_KEYS.map((k) => {
      const before = ui.abilityBefore(k);
      const value = inc.get(k) ?? 0;
      const after = cappedScore(before, value, ASI_ABILITY_MAX);
      return { k, before, value, after, capped: value > 0 && after < before + value };
    });
  });
</script>

<div class="tiles" style="--cols: 3">
  {#each MODES as m}
    <button type="button" class="tile" class:sel={mode === m.value} onclick={() => setMode(m.value)}>
      <span class="tile-value">{m.label}</span>
      <span class="tile-sub">{m.sub}</span>
    </button>
  {/each}
</div>

{#if mode === 'feat'}
  <p class="hint">Das Talent wählst du im nächsten Schritt aus der Bibliothek; die Attribute bleiben unverändert.</p>
{:else if mode}
  <p class="hint">{mode === 'plus2' ? 'Wähle das Attribut, das um 2 steigt.' : 'Wähle zwei verschiedene Attribute, die um je 1 steigen.'}</p>
  <div class="tiles" style="--cols: 3">
    {#each tiles as t (t.k)}
      <button
        type="button"
        class="tile"
        class:sel={t.value > 0}
        disabled={t.value === 0 && t.before >= ASI_ABILITY_MAX}
        title={t.value === 0 && t.before >= ASI_ABILITY_MAX ? `Schon auf dem Maximum ${ASI_ABILITY_MAX}` : undefined}
        onclick={() => pick(t.k)}
      >
        <span class="tile-label">{ABILITY_ABBR_DE[t.k]}</span>
        <span class="tile-value">{#if t.value}<s>{t.before}</s> {/if}{t.after}</span>
        <span class="tile-sub" class:capped={t.capped}>
          {ABILITY_LABEL[t.k]}{#if t.capped} · Maximum {ASI_ABILITY_MAX}{:else if t.value} · +{t.value}{/if}
        </span>
      </button>
    {/each}
  </div>
{/if}

<style>
  s { font-size: 0.85rem; font-weight: 400; color: var(--ink-muted); }
  .capped { color: var(--gold); }
</style>
