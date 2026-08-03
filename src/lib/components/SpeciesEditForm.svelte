<script lang="ts">
  import type { Species } from '$lib/types';
  import type { Trait } from '$lib/schemas/species';
  import DeclarationEditForm from './DeclarationEditForm.svelte';
  import FormSection from './ui/FormSection.svelte';
  import OriginalText from './ui/OriginalText.svelte';
  import LibraryFormHeader from './ui/LibraryFormHeader.svelte';
  import FeatureRow from './ui/FeatureRow.svelte';

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
    <FeatureRow bind:nameDe={trait.nameDe} bind:name={trait.name}
      namePlaceholder="Merkmal (DE)" removeTitle="Merkmal entfernen"
      onchange={mark} onremove={() => removeTrait(i)}>
      <textarea class="ef feat-desc" rows={3} bind:value={trait.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
      {#if trait.desc}
        <OriginalText text={trait.desc} />
      {/if}
      <!-- Die drei Deklarationen. Ohne Deklaration bleibt das Merkmal in der KI-Kette —
           das ist der Fallback, kein Fehler. -->
      <DeclarationEditForm bind:feature={species.traits[i]} scope="skills" {onchange} />
    </FeatureRow>
  {/each}
  <button class="add-feat" onclick={addTrait}>+ Merkmal</button>
</FormSection>

<style>
  .med { width: 130px; }
</style>
