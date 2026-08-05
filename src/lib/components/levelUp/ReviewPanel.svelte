<script lang="ts">
  import './levelUp.css';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
  const run = $derived(ui.run);
</script>

{#if run.doc.summary}<p class="hint">{run.doc.summary}</p>{/if}
<div class="review">
  <div class="review-line">✦ {run.doc.klasse || 'Klasse'}: Stufe {run.doc.fromLevel} → {run.doc.toLevel}</div>
  {#each ui.reviewLines as line}<div class="review-line">✦ {line}</div>{/each}
  {#if ui.reviewLines.length === 0}<div class="review-line muted">Keine automatischen Änderungen erkannt.</div>{/if}
</div>
{#if st.flagged.length}
  <div class="flagged">
    <span class="field-label warn">Nicht in der Bibliothek gefunden</span>
    {#each st.flagged as f}
      <div class="flagged-line">⚠ {f}
        <button type="button" class="link-btn" onclick={() => ui.openSpellCreator(f, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], null)}>anlegen</button>
      </div>
    {/each}
  </div>
{/if}
<p class="field-hint">Die Änderungen werden additiv in den Entwurf übernommen (bestehende Item-Boni bleiben erhalten) und farblich hervorgehoben. Speichern/Verwerfen wie gewohnt.</p>
