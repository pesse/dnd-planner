<script lang="ts">
  import type { Background } from '$lib/types';
  import { type Benefit, BENEFIT_TYPES, BENEFIT_TYPE_LABELS } from '$lib/schemas/background';
  import ProficiencyGrantEditForm from './ProficiencyGrantEditForm.svelte';
  import FormSection from './ui/FormSection.svelte';
  import OriginalText from './ui/OriginalText.svelte';
  import LibraryFormHeader from './ui/LibraryFormHeader.svelte';

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
<LibraryFormHeader bind:nameDe={background.nameDe} bind:name={background.name} onchange={mark}>
  {#snippet meta()}
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={background.key} oninput={mark} placeholder="z.B. srd-2024_soldier" />
    </label>
    <label class="lbl-inline">Herkunftstalent
      <input class="ef key-input" bind:value={background.featKey} oninput={mark} placeholder="z.B. srd-2024_alert" />
    </label>
  {/snippet}
  <label class="lbl-block">Attributswerte (EN, komma-getrennt)
    <input class="ef" bind:value={abilityText} oninput={onAbilityInput} placeholder="z.B. Strength, Dexterity, Constitution" />
  </label>
</LibraryFormHeader>

<!-- Fertigkeitsübungen (Mechanik; die Vorteils-Liste bleibt die Anzeigeebene) -->
<FormSection title="Fertigkeiten">
  {#snippet hint()}
    Die Mechanik zum <em>Fertigkeiten</em>-Vorteil. Alle SRD-Hintergründe gewähren
    genau zwei feste Fertigkeiten. Werkzeugübungen bleiben Prosa im Vorteil.
  {/snippet}
  <ProficiencyGrantEditForm bind:grant={background.proficiencyGrant} scope="skills" {onchange} />
</FormSection>

<!-- Beschreibung -->
<FormSection title="Beschreibung">
  <textarea class="ef feat-desc" rows={4} bind:value={background.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
  {#if background.desc}
    <OriginalText text={background.desc} />
  {/if}
</FormSection>

<!-- Vorteile -->
<FormSection title="Vorteile">
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
        <OriginalText text={benefit.desc} />
      {/if}
    </div>
  {/each}
  <button class="add-feat" onclick={addBenefit}>+ Vorteil</button>
</FormSection>

<style>
  .lbl-block {
    display: flex; flex-direction: column; gap: 0.15rem;
    font-size: 0.8rem; color: var(--ink-soft); margin-top: 0.3rem;
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

  .add-feat {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); cursor: pointer;
    font-family: inherit; font-size: 0.8rem; padding: 0.25rem 0.6rem; margin-top: 0.3rem;
  }
  .add-feat:hover { border-color: var(--mef-accent, var(--arcane)); color: var(--mef-accent, var(--arcane)); }
</style>
