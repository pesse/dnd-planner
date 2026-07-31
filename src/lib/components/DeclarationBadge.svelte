<script lang="ts">
  /**
   * Abdeckungs-Badge einer Bibliothekskarte. Text und Titel kommen aus `coverageBadge`
   * (services/declarationCoverage.ts) — hier steht nur die Darstellung.
   */
  import type { CoverageBadge } from '$lib/services/declarationCoverage';

  let { badge }: { badge: CoverageBadge } = $props();
</script>

<div class="declaration {badge.tone}" title={badge.title}>{badge.text}</div>

<style>
  /* Gold = es liegt noch Redaktionsarbeit an, Grün = vollständig. */
  .declaration {
    display: inline-block; margin-top: 0.35rem;
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em;
    border-radius: 3px; padding: 0.05rem 0.4rem;
  }
  .declaration.open {
    color: var(--gold); border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    background: color-mix(in srgb, var(--gold) 12%, var(--bg));
  }
  .declaration.done {
    color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 40%, var(--bg));
    background: var(--bg);
  }
</style>
