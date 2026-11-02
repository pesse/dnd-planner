<script lang="ts">
  /**
   * Abdeckung der Deklarationen: als Badge (Merkmals-Seitenleiste) oder als Hinweis über dem
   * Bearbeiten-Formular einer Bibliothekskarte. Text und Titel kommen aus `coverageBadge`.
   */
  import type { CoverageBadge } from '$lib/services/declarationCoverage';

  let { badge, hint = false }: { badge: CoverageBadge; hint?: boolean } = $props();
</script>

<div class="declaration {badge.tone}" class:hint title={badge.title}>{badge.text}</div>

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
  .declaration.hint {
    display: block; margin: 0 0 0.9rem;
    font-size: 0.8rem; text-transform: none; letter-spacing: 0;
    border-width: 0 0 0 3px; border-radius: 0; padding: 0.3rem 0.6rem;
  }
</style>
