<script lang="ts">
  /**
   * Die deklarierten Wahlen EINES Merkmals. Geschrieben wird nur über das Ledger des Panels,
   * angewendet nur über dessen `onapply` — hier entsteht kein zweiter Schreibpfad.
   */
  import type { Change } from '$lib/schemas/levelUp';
  import { choiceHint, type ChoiceFact } from '$lib/services/characterChoices';
  import type { FeatureLedger } from '$lib/services/featureLedger';
  import FeatureChoicePicker from '../FeatureChoicePicker.svelte';
  import type { ChoiceRow, ChoiceState } from './choiceState.svelte';

  let { slots, facts = [], choices, ledger, onapply }: {
    slots: ChoiceRow[];
    /** Festlegungen desselben Merkmals — read-only, sie stellen keine Frage. */
    facts?: ChoiceFact[];
    choices: ChoiceState;
    ledger: FeatureLedger;
    onapply: (changes: Change[]) => void;
  } = $props();

  // Die Stufe beschriftet nur, was sie unterscheidet: mehrere Vergaben desselben Merkmals.
  const showLevel = $derived(
    new Set([...slots.map(({ ch }) => ch.slot.gainedAt), ...facts.map((f) => f.gainedAt)]).size > 1,
  );
</script>

{#each facts as f}
  <div class="fp-fact">
    <span class="fp-fact-label">{f.labelDe}</span>
    <span class="fp-fact-value">{f.valueDe}</span>
    {#if showLevel}<span class="fp-lvl">Stufe {f.gainedAt}</span>{/if}
    {#if f.fromSource}<span class="fp-fact-note">durch den Hintergrund festgelegt</span>{/if}
  </div>
{/each}

{#each slots as { ch, i }}
  {@const g = choices.grants[i]}
  <FeatureChoicePicker
    choice={ch.choice}
    answer={ch.answer}
    open={ch.open}
    gainedAt={ch.slot.gainedAt}
    {showLevel}
    pendingGrants={!!g?.wouldAlter}
    hint={g ? choiceHint(ch, g, { wouldAlter: g.wouldAlter }) : ''}
    flagged={g?.flagged ?? []}
    diff={choices.answerDiff(ch)}
    onchange={(next) => ledger.answer(ch, next)}
    onapply={() => onapply(g?.changes ?? [])}
  />
{/each}
