<script lang="ts">
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { buildWizardCharacter } from '../../services/wizard/assembleCharacter';
  import { characterSummary, type SummarySection, type SummarySectionId } from '../../services/characterSummary';

  let { w }: { w: CharacterWizard } = $props();

  const HEADINGS: Partial<Record<SummarySectionId, string>> = {
    coreValues: 'Grundwerte',
    savingThrows: 'Rettungswürfe',
    skills: 'Fertigkeiten',
    expertise: 'Expertise',
    weapons: 'Waffen',
    armor: 'Rüstung',
    languages: 'Sprachen',
  };

  let sections = $state<SummarySection[]>([]);
  let incomplete = $state(true);

  // Die Signatur liest jedes Feld, das die Assembly liest — so läuft der Neubau bei jeder
  // Wahl, aber gebündelt statt je Tastendruck.
  $effect(() => {
    const sig = JSON.stringify($state.snapshot({
      k: w.klass, s: w.species, b: w.background, sc: w.scores, asi: w.asi, l: w.languages,
      cs: w.chosenSkills, gs: w.grantedSkills, m: w.masteries, fs: w.fightingStyles, tf: w.traitFeats,
      op: w.optionPicks, sp: w.spellcasting, da: w.declaredAnswers, d: w.declared.length,
    }));
    if (!w.species.sourceKey) { incomplete = true; sections = []; return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      void buildWizardCharacter(w).then(
        (c) => { if (!cancelled) { sections = characterSummary(c); incomplete = false; } },
        () => { if (!cancelled) incomplete = true; },
      );
    }, 250);
    void sig;
    return () => { cancelled = true; clearTimeout(timer); };
  });

  const abilities = $derived(sections.find((s) => s.id === 'abilities')?.values ?? []);
  const rest = $derived(sections.filter((s) => HEADINGS[s.id] && s.values.length));
  const pending = $derived([!w.background.sourceKey && 'Hintergrund', !w.klass.sourceKey && 'Klasse'].filter(Boolean).join(' und '));
</script>

<div class="preview">
  <h3>Dein Charakter</h3>
  {#if incomplete}
    <p class="muted">Noch unvollständig — wähle zuerst ein Volk.</p>
  {:else}
    {#if pending}<p class="muted">Zwischenstand — noch offen: {pending}.</p>{/if}
    <div class="abilities">
      {#each abilities as a}
        <div class="ability" class:save={!!a.note}>
          <span class="short">{a.short}</span>
          <span class="mod">{a.detail}</span>
          <span class="score">{a.score}</span>
        </div>
      {/each}
    </div>
    {#each rest as s (s.id)}
      <div class="section">
        <div class="heading">{HEADINGS[s.id]}</div>
        {#each s.values as v}
          <div class="row"><span>{v.label}</span>{#if v.detail}<span class="val">{v.detail}</span>{/if}</div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  .preview { display: flex; flex-direction: column; gap: 0.7rem; font-size: 0.82rem; }
  h3 { margin: 0; font-size: 0.95rem; font-family: var(--font-display, inherit); }
  .muted { color: var(--ink-muted); font-style: italic; margin: 0; }
  .abilities { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; }
  .ability {
    display: flex; flex-direction: column; align-items: center; padding: 0.3rem 0;
    border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
  }
  .ability.save { border-color: var(--arcane, var(--gold)); }
  .short { font-size: 0.7rem; color: var(--ink-muted); letter-spacing: 0.05em; }
  .mod { font-size: 1.05rem; font-weight: 700; }
  .score { font-size: 0.72rem; color: var(--ink-soft); }
  .heading { font-variant: small-caps; font-weight: 700; color: var(--ink-soft); margin-bottom: 0.1rem; }
  .row { display: flex; justify-content: space-between; gap: 0.5rem; }
  .val { font-variant-numeric: tabular-nums; color: var(--ink); }
</style>
