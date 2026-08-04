<script lang="ts">
  /**
   * Die deklarierten Wahlen EINES Merkmals. Geschrieben wird nur über das Ledger des Panels,
   * angewendet nur über dessen `onapply` — hier entsteht kein zweiter Schreibpfad.
   */
  import type { Change } from '$lib/schemas/levelUp';
  import { choiceHint } from '$lib/services/characterChoices';
  import type { FeatureLedger } from '$lib/services/featureLedger';
  import FeatureChoicePicker from '../FeatureChoicePicker.svelte';
  import type { ChoiceRow, ChoiceState } from './choiceState.svelte';

  let { slots, choices, ledger, onapply }: {
    slots: ChoiceRow[];
    choices: ChoiceState;
    ledger: FeatureLedger;
    onapply: (changes: Change[]) => void;
  } = $props();
</script>

{#each slots as { ch, i }}
  {@const g = choices.grants[i]}
  <!-- `showLevel`: die Stufe beschriftet nur, was sie unterscheidet — die Mehrfachvergabe. -->
  <FeatureChoicePicker
    choice={ch.choice}
    answer={ch.answer}
    open={ch.open}
    gainedAt={ch.slot.gainedAt}
    showLevel={slots.length > 1}
    pendingGrants={!!g?.wouldAlter}
    hint={g ? choiceHint(ch, g, { wouldAlter: g.wouldAlter }) : ''}
    flagged={g?.flagged ?? []}
    diff={choices.answerDiff(ch)}
    onchange={(next) => ledger.answer(ch, next)}
    onapply={() => onapply(g?.changes ?? [])}
  />
{/each}
