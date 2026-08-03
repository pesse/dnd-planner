<script lang="ts">
  /** Antwort ohne Wahl-Platz: kein Picker, das Merkmal deklariert keine Optionen. */
  import { choiceDisplay } from '$lib/services/characterFeatures';
  import type { FeatureLedger, LedgerRow } from '$lib/services/featureLedger';
  import './featurePanel.css';

  let { rows, ledger }: { rows: LedgerRow[]; ledger: FeatureLedger } = $props();
</script>

{#each rows as l}
  <span class="fp-choice">Entscheidung: {choiceDisplay(l.e)}
    <button type="button" class="chip-x" onclick={() => ledger.remove(l.i)}
      title="Entscheidung löschen — dieses Merkmal deklariert keine Optionen, eine neue Antwort kommt aus dem Stufenaufstieg">✕</button>
  </span>
{/each}
