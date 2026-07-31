<script lang="ts">
  import type { Feat } from '$lib/types';
  import DeclarationEditForm from './DeclarationEditForm.svelte';
  import { FEAT_CATEGORIES } from '$lib/schemas/vocabulary';
  import { FEAT_CATEGORY_DE } from '$lib/featsLibrary';
  import FormSection from './ui/FormSection.svelte';
  import OriginalText from './ui/OriginalText.svelte';
  import LibraryFormHeader from './ui/LibraryFormHeader.svelte';

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
<LibraryFormHeader bind:nameDe={feat.nameDe} bind:name={feat.name} onchange={mark}>
  {#snippet meta()}
    <label class="lbl-inline">Kategorie
      <select class="ef" bind:value={feat.category} onchange={mark}>
        {#each FEAT_CATEGORIES as c (c)}
          <option value={c}>{FEAT_CATEGORY_DE[c]}</option>
        {/each}
      </select>
    </label>
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={feat.key} oninput={mark} placeholder="z.B. srd-2024_alert" />
    </label>
  {/snippet}
</LibraryFormHeader>

<!-- Voraussetzung -->
<FormSection title="Voraussetzung">
  <input class="ef wide" bind:value={feat.prerequisiteDe} oninput={mark} placeholder="Voraussetzung (DE)" />
  {#if feat.prerequisite}
    <OriginalText text={feat.prerequisite} />
  {/if}
</FormSection>

<!-- Gewährte Übungen (SRD 5.2: nur „Geschult") -->
<!-- Die drei Deklarationen -->
<FormSection title="Deklaration">
  {#snippet hint()}
    Was das Talent gewährt, als Daten statt als Prosa — der Flow führt es dann aus der
    Deklaration statt aus der KI-Deutung. Ohne Deklaration bleibt das Talent in der KI-Kette;
    das ist der Fallback, kein Fehler.
  {/snippet}
  <DeclarationEditForm bind:feature={feat} scope="skills" {onchange} />
</FormSection>

<!-- Beschreibung -->
<FormSection title="Beschreibung (Deutsch)">
  <textarea class="ef ability-desc" rows={8} bind:value={feat.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
  {#if feat.desc}
    <OriginalText text={feat.desc} />
  {/if}
</FormSection>

<style>
  .wide { width: 100%; }
  .ability-desc { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; min-height: 3rem; }
</style>
