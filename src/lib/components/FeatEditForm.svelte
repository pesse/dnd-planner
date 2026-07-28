<script lang="ts">
  import type { Feat } from '$lib/types';
  import ProficiencyGrantEditForm from './ProficiencyGrantEditForm.svelte';

  let {
    feat = $bindable<Feat>(),
    onchange = () => void 0,
  }: {
    feat: Feat;
    onchange?: () => void;
  } = $props();

  function mark() { onchange(); }
</script>

<!-- Grunddaten -->
<div class="sb-header">
  <input class="ef sb-name" bind:value={feat.nameDe} oninput={mark} placeholder="Deutscher Name" />
  <input class="ef sb-name-en" bind:value={feat.name} oninput={mark} placeholder="Name (EN)" />
  <div class="meta-row">
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={feat.key} oninput={mark} placeholder="z.B. srd-2024_alert" />
    </label>
  </div>
</div>

<div class="divider"></div>

<!-- Voraussetzung -->
<div class="section">
  <div class="section-title">Voraussetzung</div>
  <input class="ef wide" bind:value={feat.prerequisiteDe} oninput={mark} placeholder="Voraussetzung (DE)" />
  {#if feat.prerequisite}
    <details class="orig-details">
      <summary>Original (EN)</summary>
      <div class="orig-text">{feat.prerequisite}</div>
    </details>
  {/if}
</div>

<div class="divider"></div>

<!-- Gewährte Übungen (SRD 5.2: nur „Geschult") -->
<div class="section">
  <div class="section-title">Gewährte Übungen</div>
  <p class="section-hint">
    Nur mechanisch modellierbare Fertigkeiten. „Geschult" erlaubt auch Werkzeuge —
    das steht bewusst nur in der Prosa.
  </p>
  <ProficiencyGrantEditForm bind:grant={feat.proficiencyGrant} scope="skills" {onchange} />
</div>

<div class="divider"></div>

<!-- Beschreibung -->
<div class="section">
  <div class="section-title">Beschreibung (Deutsch)</div>
  <textarea class="ef ability-desc" rows={8} bind:value={feat.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
  {#if feat.desc}
    <details class="orig-details">
      <summary>Original (EN)</summary>
      <div class="orig-text">{feat.desc}</div>
    </details>
  {/if}
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
  .key-input { font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--ink-muted); min-width: 160px; }

  .divider {
    height: 2px;
    background: linear-gradient(to right, var(--bg-raised), var(--mef-accent, var(--arcane)) 55%);
    margin: 0.6rem 0; border-radius: 1px;
  }

  .section { display: flex; flex-direction: column; gap: 0.35rem; }
  .section-title {
    font-size: 1rem; font-weight: 700; color: var(--mef-accent, var(--arcane));
    margin: 0 0 0.3rem; font-variant: small-caps;
    border-bottom: 1px solid var(--mef-accent, var(--arcane)); padding-bottom: 0.15rem;
  }

  .section-hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; margin: 0 0 0.2rem; }
  .wide { width: 100%; }
  .ability-desc { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; min-height: 3rem; }

  .orig-details { font-size: 0.78rem; }
  .orig-details summary { color: var(--border); cursor: pointer; }
  .orig-details summary:hover { color: var(--mef-accent, var(--arcane)); }
  .orig-text {
    background: var(--bg-deep); border: 1px solid var(--surface); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.8rem; line-height: 1.6;
    padding: 0.4rem 0.6rem; white-space: pre-wrap; font-style: italic; margin-top: 0.2rem;
  }
</style>
