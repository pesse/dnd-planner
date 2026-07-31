<script lang="ts">
  import type { Species } from '$lib/types';
  import type { Trait } from '$lib/schemas/species';
  import DeclarationEditForm from './DeclarationEditForm.svelte';

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
      <!-- Die drei Deklarationen. Ohne Deklaration bleibt das Merkmal in der KI-Kette —
           das ist der Fallback, kein Fehler. -->
      <DeclarationEditForm bind:feature={species.traits[i]} scope="skills" {onchange} />
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
