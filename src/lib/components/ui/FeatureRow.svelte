<script lang="ts">
  /**
   * Eine Zeile der Merkmals-/Vorteilsliste in den Bibliotheks-Editoren: Kopfzeile mit
   * deutschem und englischem Namen und dem ×, davor/dahinter Platz für ein Zeilenfeld.
   * Der Rumpf bleibt beim Aufrufer — seine Reihenfolge unterscheidet sich je Träger.
   */
  import type { Snippet } from 'svelte';

  let {
    nameDe = $bindable(),
    name = $bindable(),
    namePlaceholder,
    removeTitle,
    onchange,
    onremove,
    lead,
    trail,
    children,
  }: {
    nameDe: string | undefined;
    name: string;
    namePlaceholder: string;
    removeTitle: string;
    onchange: () => void;
    onremove: () => void;
    /** Feld VOR den Namen (Vorteilstyp). */
    lead?: Snippet;
    /** Feld NACH den Namen (Stufenliste). */
    trail?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="feat-row">
  <div class="feat-line">
    {@render lead?.()}
    <input class="ef feat-name" bind:value={nameDe} oninput={onchange} placeholder={namePlaceholder} />
    <input class="ef feat-name-en" bind:value={name} oninput={onchange} placeholder="Name (EN)" />
    {@render trail?.()}
    <button class="feat-del" onclick={onremove} title={removeTitle}>×</button>
  </div>
  {@render children()}
</div>

<style>
  .feat-row {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--surface);
  }
  .feat-line { display: flex; gap: 0.3rem; align-items: center; }
  .feat-name { flex: 2; font-weight: 600; min-width: 0; }
  .feat-name-en { flex: 2; font-style: italic; color: var(--ink-soft); font-size: 0.8rem; min-width: 0; }
  .feat-del {
    background: none; border: none; color: var(--ink-muted); font-size: 1.1rem;
    cursor: pointer; line-height: 1; flex-shrink: 0; padding: 0 0.2rem;
  }
  .feat-del:hover { color: var(--danger); }
</style>
