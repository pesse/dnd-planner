<script lang="ts">
  /**
   * Chip-Liste (Sprachen, Werkzeuge, einzeln geübte Waffen). `suggest` schaltet die
   * Bibliotheks-Autocomplete zu, `annotate` einen aufgelösten Zusatz am Chip; ohne beides
   * bleibt es reiner Freitext.
   *
   * Enter OHNE markierten Treffer übernimmt den Tippstand: eine Homebrew-Waffe steht in
   * keiner Bibliothek, soll aber erklärbar sein.
   */
  import { diffMark } from '../../utils/diffHighlight';
  import { createSuggestNav } from '../../utils/suggestNav.svelte';
  import { dropdownPlacement } from '../../utils/dropdownPlacement';
  import './form.css';

  interface Suggestion {
    value: string;
    /** Zweite Spalte des Treffers, z.B. die Meisterschaftseigenschaft. */
    hint?: string;
  }

  let { values, placeholder, savedValues, suggest, annotate }: {
    values: string[];
    placeholder: string;
    /** Gespeicherter Stand fürs Diff; `undefined` = keine Baseline, keine Hervorhebung. */
    savedValues?: string[];
    suggest?: (query: string) => Suggestion[];
    annotate?: (value: string) => { suffix: string; title: string } | undefined;
  } = $props();

  let input = $state('');
  let suggestions = $state<Suggestion[]>([]);

  $effect(() => {
    suggestions = suggest && input.trim() ? suggest(input) : [];
    nav.reset();
  });

  function add(raw: string) {
    const v = raw.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) values.push(v);
    input = '';
    suggestions = [];
    nav.reset();
  }

  const nav = createSuggestNav<Suggestion>({
    items: () => suggestions,
    pick: (sug) => add(sug.value),
    enter: () => add(input),
    escape: () => { suggestions = []; },
  });
</script>

<div class="tag-editor">
  {#each values as value}
    {@const note = annotate?.(value)}
    <span class="tag" title={note?.title}
      use:diffMark={!savedValues ? 'none' : savedValues.includes(value) ? 'none' : 'up'}>
      {value}{#if note}<span class="tag-note"> ({note.suffix})</span>{/if}
      <button onclick={() => values.splice(values.indexOf(value), 1)}>✕</button>
    </span>
  {/each}
  <div class="autocomplete-wrap" class:tag-picker={!!suggest}>
    <input class="tag-input" bind:value={input} {placeholder} onkeydown={nav.onkeydown} />
    {#if suggestions.length}
      <ul class="suggestions" use:dropdownPlacement>
        {#each suggestions as sug, i}
          <li class:active={i === nav.index}
            onclick={() => add(sug.value)}
            onmouseenter={() => (nav.index = i)}>
            <span>{sug.value}</span>
            {#if sug.hint}<span class="sug-cat">{sug.hint}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <button class="btn-add-sm" onclick={() => add(input)}>+</button>
</div>
