<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { Job } from '../../services/wizard/job.svelte';
  import { buildWizardCharacter } from '../../services/wizard/assembleCharacter';
  import { buildCharacterProtocol } from '../../services/characterProtocol';
  import { choiceLabelsDe } from '../../services/analysis/types';
  import { loadSheetSpellcasting, type SheetSpellcasting } from '../../services/spellcasting/project';
  import type { Character } from '../../schemas/characterSchema';

  let { w, aiBusy, createError, statusText }: {
    w: CharacterWizard;
    aiBusy: boolean;
    createError: string;
    statusText: (job: Job<unknown>) => string;
  } = $props();

  // Genau wie beim Stufenaufstieg SICHTBAR machen, was der Charakter bekommt. Aus dem fertig
  // zusammengesetzten Charakter abgeleitet, damit die Vorschau exakt dem entspricht, was
  // gespeichert wird — nicht bloß den Ridern.
  let preview = $state<Character | null>(null);
  $effect(() => {
    // Job-Status mitlesen, damit die Vorschau nachzieht, sobald KI-Schritte fertig werden.
    void [w.classText.status, w.speciesText.status, w.equipment.status];
    let cancelled = false;
    buildWizardCharacter(w).then((c) => { if (!cancelled) preview = c; }).catch(() => {});
    return () => { cancelled = true; };
  });

  let spellcasting = $state<SheetSpellcasting | null>(null);
  $effect(() => {
    const c = preview;
    if (!c) { spellcasting = null; return; }
    let cancelled = false;
    loadSheetSpellcasting(c).then((v) => { if (!cancelled) spellcasting = v; }).catch(() => {});
    return () => { cancelled = true; };
  });

  /**
   * Die getroffenen Wahlen, aus Frage und Antwort neu gebaut: gewählte Zauber stehen im
   * Zauber-Block und wären hier die Dublette.
   */
  const decisions = $derived.by(() => {
    const byId = new Map(w.declaredChoices.map((c) => [c.id, c]));
    return w.declaredAnswers.flatMap((a) => {
      const ch = byId.get(a.id);
      if (!ch?.isBuildDecision || ch.type === 'spell-pick') return [];
      return [{ question: ch.questionDe || ch.question, answer: choiceLabelsDe(ch, a.choice) }];
    });
  });

  const protocolGroups = $derived(
    preview
      ? buildCharacterProtocol(preview, { decisions, ...(spellcasting ? { spellcasting } : {}) })
      : [],
  );
</script>

<div class="review">
  <p><strong>{w.name}</strong> — {w.klass.name} 1, {w.species.name}, {w.background.name}</p>

  <div class="protocol">
    <span class="section-label">Das wird angelegt</span>
    {#if !preview}
      <p class="hint">Charakter wird zusammengestellt …{#if aiBusy} (KI-Schritte laufen noch){/if}</p>
    {:else}
      {#each protocolGroups as g}
        <div class="proto-group">
          <div class="proto-heading">{g.heading}</div>
          {#each g.lines as l}<div class="proto-line">• {l}</div>{/each}
        </div>
      {/each}
    {/if}
  </div>

  <ul class="jobs">
    <li>Klassenmerkmals-Text: {statusText(w.classText)}</li>
    <li>Volksmerkmals-Text: {statusText(w.speciesText)}</li>
    <li>Ausrüstung: {statusText(w.equipment)}</li>
  </ul>
  <p class="hint">Beim Erstellen wird kurz auf noch laufende KI-Schritte gewartet und ihr Ergebnis übernommen — was fehlschlägt, kannst du im Editor ergänzen.</p>
  {#if createError}<p class="warn">{createError}</p>{/if}
</div>

<style>
  .section-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
  .protocol { display: flex; flex-direction: column; gap: 0.5rem; }
  .proto-group { border-left: 2px solid var(--border-strong); padding-left: 0.6rem; }
  .proto-heading { font-weight: 600; font-size: 0.86rem; color: var(--ink); }
  .proto-line { font-size: 0.84rem; color: var(--ink-soft); }
  .jobs { list-style: none; padding: 0; margin: 0.5rem 0; font-size: 0.85rem; color: var(--ink-soft); display: flex; flex-direction: column; gap: 0.2rem; }
</style>
