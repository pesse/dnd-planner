<script lang="ts">
  import type { Species } from '$lib/types';
  import type { Trait } from '$lib/schemas/species';
  import { emptyProficiencyGrant, featureChoiceGrantSchema, type FeatureChoiceGrant } from '$lib/schemas/shared';
  import { isEmptyGrant, skillGrantSummary } from '$lib/services/proficiencyGrants';
  import ProficiencyGrantEditForm from './ProficiencyGrantEditForm.svelte';
  import ChoiceOptionEditForm from './ChoiceOptionEditForm.svelte';

  let {
    species = $bindable<Species>(),
    onchange = () => void 0,
  }: {
    species: Species;
    onchange?: () => void;
  } = $props();

  function mark() { onchange(); }

  function addTrait() {
    const trait: Trait = { key: '', name: '', desc: '', proficiencyGrant: emptyProficiencyGrant() };
    species.traits = [...species.traits, trait];
    onchange();
  }

  function removeTrait(i: number) {
    species.traits = species.traits.filter((_, idx) => idx !== i);
    onchange();
  }

  // Dieselben zwei redigierbaren Formen wie am Klassenmerkmal (ClassEditForm). Die
  // Abstammungen (Gnom, Elf) gehören NICHT hierher: sie tragen eine zweite Wahl in derselben
  // Prosa und sind `spellAccess` mit Zweig — Hand-JSON, läuft über 'other'.
  const CHOICE_LABELS: Record<string, string> = {
    optionList: 'Optionsliste (Zweigwahl)',
    expertise: 'Expertise',
  };

  function choiceKindOf(t: Trait): string {
    const g = t.grantsChoice;
    if (!g) return 'none';
    if (g.kind === 'optionList' || g.kind === 'expertise') return g.kind;
    return 'other';
  }

  const newGrant = (g: Partial<FeatureChoiceGrant>): FeatureChoiceGrant => featureChoiceGrantSchema.parse(g);

  function setChoiceKind(t: Trait, value: string) {
    const prev = t.grantsChoice;
    // Optionen bzw. Anzahl beim Wechsel mitnehmen — ein Fehlgriff im Dropdown soll keine
    // Redaktionsarbeit löschen.
    if (value === 'optionList') t.grantsChoice = newGrant({ kind: 'optionList', options: prev?.options ?? [] });
    else if (value === 'expertise') t.grantsChoice = newGrant({ kind: 'expertise', count: prev?.count ?? 1 });
    onchange();
  }

  function toggleChoice(t: Trait, on: boolean) {
    t.grantsChoice = on ? newGrant({ kind: 'optionList', options: [] }) : undefined;
    onchange();
  }
</script>

<!-- Grunddaten -->
<div class="sb-header">
  <input class="ef sb-name" bind:value={species.nameDe} oninput={mark} placeholder="Deutscher Name" />
  <input class="ef sb-name-en" bind:value={species.name} oninput={mark} placeholder="Name (EN)" />
  <div class="meta-row">
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={species.key} oninput={mark} placeholder="z.B. srd-2024_elf" />
    </label>
    <label class="lbl-inline">Größe
      <input class="ef med" bind:value={species.size} oninput={mark} placeholder="z.B. Mittelgroß" />
    </label>
    <label class="lbl-inline">Geschwindigkeit
      <input class="ef med" bind:value={species.speed} oninput={mark} placeholder="z.B. 9 m" />
    </label>
  </div>
</div>

<div class="divider"></div>

<!-- Merkmale -->
<div class="section">
  <div class="section-title">Merkmale</div>
  {#each species.traits as trait, i}
    <div class="feat-row">
      <div class="feat-line">
        <input class="ef feat-name" bind:value={trait.nameDe} oninput={mark} placeholder="Merkmal (DE)" />
        <input class="ef feat-name-en" bind:value={trait.name} oninput={mark} placeholder="Name (EN)" />
        <button class="feat-del" onclick={() => removeTrait(i)} title="Merkmal entfernen">×</button>
      </div>
      <textarea class="ef feat-desc" rows={3} bind:value={trait.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
      {#if trait.desc}
        <details class="orig-details">
          <summary>Original (EN)</summary>
          <div class="orig-text">{trait.desc}</div>
        </details>
      {/if}
      <!-- Der Grant hängt am Merkmal; im SRD 5.2 nur Elf „Scharfe Sinne" und Mensch „Vielseitig". -->
      <details class="grant-details" open={!isEmptyGrant(trait.proficiencyGrant)}>
        <summary>
          Gewährte Übungen
          {#if !isEmptyGrant(trait.proficiencyGrant)}
            <span class="grant-summary">{skillGrantSummary(trait.proficiencyGrant.skills)}</span>
          {/if}
        </summary>
        <ProficiencyGrantEditForm bind:grant={trait.proficiencyGrant} scope="skills" {onchange} />
      </details>
      <!-- Deklarierte Wahl: nimmt das Merkmal aus der KI-Deutung. Ohne Deklaration bleibt es
           in der Kette — das ist der Fallback, kein Fehler. -->
      <div class="choice-row">
        <label class="lbl-inline" class:off={!trait.grantsChoice}>
          <input
            type="checkbox"
            checked={!!trait.grantsChoice}
            onchange={(e) => toggleChoice(trait, (e.target as HTMLInputElement).checked)}
          />
          Gewährt Wahl
        </label>
        <select
          class="ef meta-sel"
          disabled={!trait.grantsChoice}
          value={trait.grantsChoice ? choiceKindOf(trait) : 'optionList'}
          onchange={(e) => setChoiceKind(trait, (e.target as HTMLSelectElement).value)}
        >
          {#each Object.entries(CHOICE_LABELS) as [val, label]}
            <option value={val}>{label}</option>
          {/each}
          {#if choiceKindOf(trait) === 'other'}
            <option value="other" disabled selected>Aus JSON: {trait.grantsChoice?.kind}</option>
          {/if}
        </select>
        {#if trait.grantsChoice && choiceKindOf(trait) === 'expertise'}
          <span class="lbl-inline">Fertigkeiten
            <input class="ef num" type="number" min="1" bind:value={trait.grantsChoice.count} oninput={mark} />
          </span>
          <span class="choice-note">Optionen zur Laufzeit: die geübten Fertigkeiten des Charakters</span>
        {/if}
      </div>
      {#if trait.grantsChoice && choiceKindOf(trait) === 'optionList'}
        <div class="feat-options">
          <ChoiceOptionEditForm bind:options={trait.grantsChoice.options} scope="skills" {onchange} />
        </div>
      {/if}
    </div>
  {/each}
  <button class="add-feat" onclick={addTrait}>+ Merkmal</button>
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
  .med { width: 130px; }
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

  .feat-row {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--surface);
  }
  .feat-line { display: flex; gap: 0.3rem; align-items: center; }
  .feat-name { flex: 2; font-weight: 600; }
  .feat-name-en { flex: 2; font-style: italic; color: var(--ink-soft); font-size: 0.8rem; }
  .feat-del {
    background: none; border: none; color: var(--ink-muted); font-size: 1.1rem;
    cursor: pointer; line-height: 1; flex-shrink: 0; padding: 0 0.2rem;
  }
  .feat-del:hover { color: var(--danger); }
  .feat-desc { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; }

  .orig-details { font-size: 0.78rem; }
  .orig-details summary { color: var(--border); cursor: pointer; }
  .orig-details summary:hover { color: var(--mef-accent, var(--arcane)); }

  .choice-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-top: 0.3rem; }
  .choice-row .lbl-inline { cursor: pointer; }
  .choice-row .lbl-inline.off { color: var(--ink-muted); opacity: 0.6; }
  .choice-row select:disabled { opacity: 0.45; cursor: not-allowed; }
  .meta-sel { cursor: pointer; }
  .num { width: 48px; text-align: center; }
  .choice-note { font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .feat-options { border-left: 2px solid var(--surface); padding-left: 0.5rem; margin: 0.2rem 0; }

  .grant-details { font-size: 0.78rem; margin-top: 0.15rem; }
  .grant-details summary { color: var(--ink-muted); cursor: pointer; }
  .grant-details summary:hover { color: var(--mef-accent, var(--arcane)); }
  .grant-summary { color: var(--mef-accent, var(--arcane)); font-style: italic; margin-left: 0.3rem; }
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
