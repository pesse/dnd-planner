<script lang="ts">
  import type { Background } from '$lib/types';
  import { type Benefit, BENEFIT_TYPES, BENEFIT_TYPE_LABELS } from '$lib/schemas/background';
  import ProficiencyGrantEditForm from './ProficiencyGrantEditForm.svelte';

  let {
    background = $bindable<Background>(),
    onchange = () => void 0,
  }: {
    background: Background;
    onchange?: () => void;
  } = $props();

  function mark() { onchange(); }

  /**
   * `abilityScores` ist im Schema ein Array englischer Attributsnamen, wird hier
   * aber als komma-getrennte Zeile bearbeitet — genau die Form, in der Open5e sie
   * auch liefert.
   */
  let abilityText = $state(background.abilityScores.join(', '));

  function onAbilityInput() {
    background.abilityScores = abilityText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onchange();
  }

  function addBenefit() {
    const benefit: Benefit = { key: '', type: 'other', name: '', desc: '' };
    background.benefits = [...background.benefits, benefit];
    onchange();
  }

  function removeBenefit(i: number) {
    background.benefits = background.benefits.filter((_, idx) => idx !== i);
    onchange();
  }
</script>

<!-- Grunddaten -->
<div class="sb-header">
  <input class="ef sb-name" bind:value={background.nameDe} oninput={mark} placeholder="Deutscher Name" />
  <input class="ef sb-name-en" bind:value={background.name} oninput={mark} placeholder="Name (EN)" />
  <div class="meta-row">
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={background.key} oninput={mark} placeholder="z.B. srd-2024_soldier" />
    </label>
    <label class="lbl-inline">Herkunftstalent
      <input class="ef key-input" bind:value={background.featKey} oninput={mark} placeholder="z.B. srd-2024_alert" />
    </label>
  </div>
  <label class="lbl-block">Attributswerte (EN, komma-getrennt)
    <input class="ef" bind:value={abilityText} oninput={onAbilityInput} placeholder="z.B. Strength, Dexterity, Constitution" />
  </label>
</div>

<div class="divider"></div>

<!-- Fertigkeitsübungen (Mechanik; die Vorteils-Liste bleibt die Anzeigeebene) -->
<div class="section">
  <div class="section-title">Fertigkeiten</div>
  <p class="section-hint">
    Die Mechanik zum <em>Fertigkeiten</em>-Vorteil. Alle SRD-Hintergründe gewähren
    genau zwei feste Fertigkeiten. Werkzeugübungen bleiben Prosa im Vorteil.
  </p>
  <ProficiencyGrantEditForm bind:grant={background.proficiencyGrant} scope="skills" {onchange} />
</div>

<div class="divider"></div>

<!-- Beschreibung -->
<div class="section">
  <div class="section-title">Beschreibung</div>
  <textarea class="ef feat-desc" rows={4} bind:value={background.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
  {#if background.desc}
    <details class="orig-details">
      <summary>Original (EN)</summary>
      <div class="orig-text">{background.desc}</div>
    </details>
  {/if}
</div>

<div class="divider"></div>

<!-- Vorteile -->
<div class="section">
  <div class="section-title">Vorteile</div>
  {#each background.benefits as benefit, i}
    <div class="feat-row">
      <div class="feat-line">
        <select class="ef type-select" bind:value={benefit.type} onchange={mark}>
          {#each BENEFIT_TYPES as t}
            <option value={t}>{BENEFIT_TYPE_LABELS[t]}</option>
          {/each}
        </select>
        <input class="ef feat-name" bind:value={benefit.nameDe} oninput={mark} placeholder="Vorteil (DE)" />
        <input class="ef feat-name-en" bind:value={benefit.name} oninput={mark} placeholder="Name (EN)" />
        <button class="feat-del" onclick={() => removeBenefit(i)} title="Vorteil entfernen">×</button>
      </div>
      <textarea class="ef feat-desc" rows={2} bind:value={benefit.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
      {#if benefit.desc}
        <details class="orig-details">
          <summary>Original (EN)</summary>
          <div class="orig-text">{benefit.desc}</div>
        </details>
      {/if}
    </div>
  {/each}
  <button class="add-feat" onclick={addBenefit}>+ Vorteil</button>
</div>

<style>
  .ef {
    background: var(--bg-panel);
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--ink);
    font-family: inherit;
    font-size: 0.88rem;
    padding: 0.15rem 0.3rem;
    outline: none;
  }
  .ef:hover { border-color: var(--border); }
  .ef:focus { border-color: var(--mef-accent, var(--arcane)); }

  .sb-header { margin-bottom: 0.4rem; display: flex; flex-direction: column; gap: 0.15rem; }
  .sb-name {
    font-size: 1.3rem; font-weight: 700; color: var(--mef-accent, var(--arcane));
    font-variant: small-caps; width: 100%;
  }
  .sb-name-en { font-size: 0.85rem; color: var(--ink-soft); font-style: italic; width: 100%; }

  .meta-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.3rem; }
  .lbl-inline {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.8rem; color: var(--ink-soft);
  }
  .lbl-block {
    display: flex; flex-direction: column; gap: 0.15rem;
    font-size: 0.8rem; color: var(--ink-soft); margin-top: 0.3rem;
  }
  .key-input { font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--ink-muted); min-width: 160px; }

  .divider {
    height: 2px;
    background: linear-gradient(to right, var(--bg-raised), var(--mef-accent, var(--arcane)) 55%);
    margin: 0.6rem 0; border-radius: 1px;
  }

  .section { display: flex; flex-direction: column; gap: 0.35rem; }
  .section-hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; margin: 0 0 0.2rem; }
  .section-title {
    font-size: 1rem; font-weight: 700; color: var(--mef-accent, var(--arcane));
    margin: 0 0 0.3rem; font-variant: small-caps;
    border-bottom: 1px solid var(--mef-accent, var(--arcane)); padding-bottom: 0.15rem;
  }

  .feat-row {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--surface);
  }
  .feat-line { display: flex; gap: 0.3rem; align-items: center; }
  .type-select { flex-shrink: 0; font-size: 0.78rem; color: var(--ink-soft); }
  .feat-name { flex: 2; font-weight: 600; min-width: 0; }
  .feat-name-en { flex: 2; font-style: italic; color: var(--ink-soft); font-size: 0.8rem; min-width: 0; }
  .feat-del {
    background: none; border: none; color: var(--ink-muted); font-size: 1.1rem;
    cursor: pointer; line-height: 1; flex-shrink: 0; padding: 0 0.2rem;
  }
  .feat-del:hover { color: var(--danger); }
  .feat-desc { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; }

  .orig-details { font-size: 0.78rem; }
  .orig-details summary { color: var(--border); cursor: pointer; }
  .orig-details summary:hover { color: var(--mef-accent, var(--arcane)); }
  .orig-text {
    background: var(--bg-deep); border: 1px solid var(--surface); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.8rem; line-height: 1.6;
    padding: 0.4rem 0.6rem; white-space: pre-wrap; font-style: italic; margin-top: 0.2rem;
  }

  .add-feat {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); cursor: pointer;
    font-family: inherit; font-size: 0.8rem; padding: 0.25rem 0.6rem; margin-top: 0.3rem;
  }
  .add-feat:hover { border-color: var(--mef-accent, var(--arcane)); color: var(--mef-accent, var(--arcane)); }
</style>
