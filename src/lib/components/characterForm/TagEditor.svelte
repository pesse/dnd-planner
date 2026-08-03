<script lang="ts">
  /** Freitext-Liste als Chips (Sprachen, Werkzeuge) — kein geschlossenes Vokabular. */
  import { diffMark } from '../../utils/diffHighlight';
  import './form.css';

  let { values, placeholder, savedValues }: {
    values: string[];
    placeholder: string;
    /** Gespeicherter Stand fürs Diff; `undefined` = keine Baseline, keine Hervorhebung. */
    savedValues?: string[];
  } = $props();

  let input = $state('');

  function add(e: KeyboardEvent | MouseEvent) {
    if ('key' in e && e.key !== 'Enter') return;
    const v = input.trim();
    if (v && !values.includes(v)) values.push(v);
    input = '';
  }
</script>

<div class="tag-editor">
  {#each values as value}
    <span class="tag" use:diffMark={!savedValues ? 'none' : savedValues.includes(value) ? 'none' : 'up'}>
      {value}<button onclick={() => values.splice(values.indexOf(value), 1)}>✕</button>
    </span>
  {/each}
  <input class="tag-input" bind:value={input} {placeholder} onkeydown={add} />
  <button class="btn-add-sm" onclick={add}>+</button>
</div>
