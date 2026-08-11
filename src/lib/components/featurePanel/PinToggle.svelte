<script lang="ts">
  /**
   * „Auf den Bogen": schaltet einen Merkmals-Key in `character.pinnedFeatures`. Ohne Key gibt
   * es nichts zu pinnen — ein unverlinktes Merkmal steht ohnehin nur im Freitext.
   */
  import type { FeaturePins } from '$lib/services/featurePins';

  let { pins, featureKey }: { pins: FeaturePins; featureKey: string | undefined } = $props();

  const on = $derived(pins.has(featureKey));
</script>

{#if featureKey?.trim()}
  <button
    type="button"
    class="pin-btn"
    class:on
    aria-pressed={on}
    title={on ? 'Steht im Ausdruck — Klick nimmt es heraus' : 'Im Ausdruck als Volltext anhängen'}
    onclick={() => pins.toggle(featureKey)}
  >📌</button>
{/if}
