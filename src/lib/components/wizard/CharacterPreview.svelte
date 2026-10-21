<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Character } from '../../schemas/characterSchema';
  import { characterSummary, type SummarySectionId, type SummaryValue } from '../../services/characterSummary';

  let { character, baseline = null, emptyText, note = '', children }: {
    character: Character | null;
    /** Stand vor dem Assistenten — mit ihm markiert die Vorschau, was neu ist oder sich ändert. */
    baseline?: Character | null;
    emptyText: string;
    note?: string;
    children?: Snippet;
  } = $props();

  const HEADINGS: Partial<Record<SummarySectionId, string>> = {
    coreValues: 'Grundwerte',
    savingThrows: 'Rettungswürfe',
    skills: 'Fertigkeiten',
    expertise: 'Expertise',
    weapons: 'Waffen',
    armor: 'Rüstung',
    languages: 'Sprachen',
  };

  const sections = $derived(character ? characterSummary(character) : []);
  const before = $derived.by(() => {
    if (!baseline) return null;
    return new Map(characterSummary(baseline).map((s) => [s.id, new Map(s.values.map((v) => [v.label, v]))]));
  });

  /** `null` ohne Vergleichsstand; sonst `undefined` für neu, den alten Wert bei geändertem. */
  function previous(id: SummarySectionId, v: SummaryValue): SummaryValue | null | undefined {
    if (!before) return null;
    return before.get(id)?.get(v.label);
  }
  const changed = (a: SummaryValue, b: SummaryValue) => a.detail !== b.detail || a.score !== b.score || a.note !== b.note;

  const abilities = $derived(sections.find((s) => s.id === 'abilities')?.values ?? []);
  const rest = $derived(sections.filter((s) => HEADINGS[s.id] && s.values.length));
</script>

<div class="preview">
  <h3>Dein Charakter</h3>
  {#if !character}
    <p class="muted">{emptyText}</p>
  {:else}
    {#if note}<p class="muted">{note}</p>{/if}
    <div class="abilities">
      {#each abilities as a}
        {@const old = previous('abilities', a)}
        <div class="ability" class:save={!!a.note} class:changed={!!old && changed(old, a)}>
          <span class="short">{a.short}</span>
          <span class="mod">{a.detail}</span>
          <span class="score">{#if old && old.score !== a.score}{old.score} → {/if}{a.score}</span>
        </div>
      {/each}
    </div>
    {#each rest as s (s.id)}
      <div class="section">
        <div class="heading">{HEADINGS[s.id]}</div>
        {#each s.values as v}
          {@const old = previous(s.id, v)}
          <div class="row" class:new={old === undefined} class:changed={!!old && changed(old, v)}>
            <span>{v.label}</span>
            {#if v.detail}<span class="val">{#if old && old.detail !== v.detail}<s>{old.detail}</s> {/if}{v.detail}</span>{/if}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
  {@render children?.()}
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
  .ability.changed { box-shadow: inset 0 0 0 1px var(--gold); }
  .short { font-size: 0.7rem; color: var(--ink-muted); letter-spacing: 0.05em; }
  .mod { font-size: 1.05rem; font-weight: 700; }
  .score { font-size: 0.72rem; color: var(--ink-soft); }
  .heading { font-variant: small-caps; font-weight: 700; color: var(--ink-soft); margin-bottom: 0.1rem; }
  .row { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0 0.25rem; border-radius: 3px; }
  .row.new, .row.changed { background: color-mix(in srgb, var(--gold) 18%, transparent); }
  .row.new > span:first-child::before { content: '+ '; color: var(--gold); font-weight: 700; }
  .val { font-variant-numeric: tabular-nums; color: var(--ink); }
  s { color: var(--ink-muted); }
</style>
