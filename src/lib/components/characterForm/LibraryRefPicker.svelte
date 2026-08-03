<script lang="ts" generics="T">
  /**
   * Ein Bibliotheks-Link im Formular: entweder als Link auf die Kartenseite (mit ✎ zum
   * Ändern) oder als Autocomplete-Eingabe. Dreimal benutzt — Klassenzeile, Volk,
   * Hintergrund; die Trefferliste und was ein Treffer bedeutet, liefert der Aufrufer.
   */
  import { createSuggestNav } from '../../utils/suggestNav.svelte';
  import './form.css';

  let {
    name,
    linked,
    editing,
    placeholder,
    editTitle,
    wide = false,
    search,
    label,
    onopen,
    oninput,
    onselect,
    onediting,
  }: {
    name: string;
    /** Verlinkt (Key trifft die Bibliothek) — mit `editing` zusammen entscheidet es die Ansicht. */
    linked: boolean;
    editing: boolean;
    placeholder: string;
    editTitle: string;
    wide?: boolean;
    search: (query: string) => T[];
    label: (hit: T) => string;
    onopen: () => void;
    oninput: (value: string) => void;
    onselect: (hit: T) => void;
    onediting: (value: boolean) => void;
  } = $props();

  let active = $state(false);
  let suggestions = $state<T[]>([]);

  function type(value: string) {
    oninput(value);
    active = true;
    nav.reset();
    suggestions = value.trim() ? search(value) : [];
  }

  function pick(hit: T) {
    onselect(hit);
    suggestions = [];
    active = false;
    nav.reset();
    onediting(false);
  }

  const nav = createSuggestNav<T>({
    items: () => suggestions,
    pick,
    escape: () => { suggestions = []; active = false; },
  });

  function onkeydown(e: KeyboardEvent) {
    if (!active) return;
    nav.onkeydown(e);
  }

  function onblur() {
    setTimeout(() => {
      active = false;
      suggestions = [];
      if (linked) onediting(false);
    }, 150);
  }
</script>

{#if linked && !editing}
  <div class="class-linked">
    <button type="button" class="class-link" title="Bibliotheks-Seite öffnen" onclick={onopen}>{name}</button>
    <button type="button" class="link-edit" title={editTitle} onclick={() => onediting(true)}>✎</button>
  </div>
{:else}
  <div class="autocomplete-wrap" class:species-picker={wide}>
    <input
      value={name}
      {placeholder}
      oninput={(e) => type(e.currentTarget.value)}
      {onkeydown}
      {onblur}
    />
    {#if active && suggestions.length > 0}
      <ul class="suggestions">
        {#each suggestions as sug, i}
          <li class:active={i === nav.index} onmousedown={() => pick(sug)}>
            <span>{label(sug)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
