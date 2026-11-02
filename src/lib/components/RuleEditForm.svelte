<script lang="ts">
  import { RULE_CATEGORIES, RULE_CATEGORY_DE, type Rule } from '$lib/schemas/rule';
  import FormSection from './ui/FormSection.svelte';
  import OriginalText from './ui/OriginalText.svelte';
  import LibraryFormHeader from './ui/LibraryFormHeader.svelte';

  let {
    rule = $bindable<Rule>(),
    onchange = () => void 0,
  }: {
    rule: Rule;
    onchange?: () => void;
  } = $props();

  function mark() { onchange(); }
</script>

<LibraryFormHeader bind:nameDe={rule.nameDe} bind:name={rule.name} onchange={mark}>
  {#snippet meta()}
    <label class="lbl-inline">Kategorie
      <select class="ef" bind:value={rule.category} onchange={mark}>
        {#each RULE_CATEGORIES as c (c)}
          <option value={c}>{RULE_CATEGORY_DE[c]}</option>
        {/each}
      </select>
    </label>
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={rule.key} oninput={mark} placeholder="z.B. srd-2024_blinded" />
    </label>
  {/snippet}
</LibraryFormHeader>

<FormSection title="Beschreibung (Deutsch)">
  <textarea class="ef rule-desc" rows={10} bind:value={rule.descDe} oninput={mark} placeholder="Beschreibung (DE)"></textarea>
  {#if rule.desc}
    <OriginalText text={rule.desc} />
  {/if}
</FormSection>

<style>
  .rule-desc { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; min-height: 3rem; }
</style>
