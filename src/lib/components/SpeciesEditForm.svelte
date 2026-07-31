<script lang="ts">
  import type { Species } from '$lib/types';
  import type { Trait } from '$lib/schemas/species';
  import DeclarationEditForm from './DeclarationEditForm.svelte';
  import FormSection from './ui/FormSection.svelte';
  import OriginalText from './ui/OriginalText.svelte';
  import LibraryFormHeader from './ui/LibraryFormHeader.svelte';

  let {
    species = $bindable<Species>(),
    onchange = () => void 0,
  }: {
    species: Species;
    onchange?: () => void;
  } = $props();

  function mark() { onchange(); }

  function addTrait() {
    const trait: Trait = { key: '', name: '', desc: '' };
    species.traits = [...species.traits, trait];
    onchange();
  }

  function removeTrait(i: number) {
    species.traits = species.traits.filter((_, idx) => idx !== i);
    onchange();
  }

</script>

<!-- Grunddaten -->
<LibraryFormHeader bind:nameDe={species.nameDe} bind:name={species.name} onchange={mark}>
  {#snippet meta()}
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={species.key} oninput={mark} placeholder="z.B. srd-2024_elf" />
    </label>
    <label class="lbl-inline">Größe
      <input class="ef med" bind:value={species.size} oninput={mark} placeholder="z.B. Mittelgroß" />
    </label>
    <label class="lbl-inline">Geschwindigkeit
      <input class="ef med" bind:value={species.speed} oninput={mark} placeholder="z.B. 9 m" />
    </label>
  {/snippet}
</LibraryFormHeader>

<!-- Merkmale -->
<FormSection title="Merkmale">
  {#each species.traits as trait, i}
    <div class="feat-row">
      <div class="feat-line">
        <input class="ef feat-name" bind:value={trait.nameDe} oninput={mark} placeholder="Merkmal (DE)" />
        <input class="ef feat-name-en" bind:value={trait.name} oninput={mark} placeholder="Name (EN)" />
        <button class="feat-del" onclick={() => removeTrait(i)} title="Merkmal entfernen">×</button>
      </div>
      <textarea class="ef feat-desc" rows={3} bind:value={trait.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
      {#if trait.desc}
        <OriginalText text={trait.desc} />
      {/if}
      <!-- Die drei Deklarationen. Ohne Deklaration bleibt das Merkmal in der KI-Kette —
           das ist der Fallback, kein Fehler. -->
      <DeclarationEditForm bind:feature={species.traits[i]} scope="skills" {onchange} />
    </div>
  {/each}
  <button class="add-feat" onclick={addTrait}>+ Merkmal</button>
</FormSection>

<style>
  .med { width: 130px; }

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

  .add-feat {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); cursor: pointer;
    font-family: inherit; font-size: 0.8rem; padding: 0.25rem 0.6rem; margin-top: 0.3rem;
  }
  .add-feat:hover { border-color: var(--mef-accent, var(--arcane)); color: var(--mef-accent, var(--arcane)); }
</style>
