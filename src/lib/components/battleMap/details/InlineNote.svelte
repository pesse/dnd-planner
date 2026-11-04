<script lang="ts">
  /** Einzeilige Notiz, die außerhalb der Bearbeitung als Text steht — so greifen die Würfel-Links darin. */
  import { tick } from 'svelte';

  let { value = $bindable(), placeholder, label }: { value: string; placeholder: string; label: string } = $props();

  let editing = $state(false);
  let input = $state<HTMLInputElement>();

  async function edit() {
    editing = true;
    await tick();
    input?.focus();
  }
</script>

{#if editing}
  <input
    bind:this={input}
    bind:value
    {placeholder}
    aria-label={label}
    onblur={() => (editing = false)}
    onkeydown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
  />
{:else}
  <div class="text" class:empty={!value} role="textbox" tabindex="0" aria-label={label} onclick={edit} onfocus={edit} onkeydown={(e) => e.key === 'Enter' && edit()}>{value || placeholder}</div>
{/if}

<style>
  input,
  .text {
    width: 100%;
    box-sizing: border-box;
    padding: 0.1rem 0.35rem;
    font-size: 0.75rem;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-soft);
  }
  .text {
    cursor: text;
    min-height: 1.4em;
  }
  .text:hover {
    border-color: var(--border);
  }
  .empty {
    color: var(--ink-muted);
    opacity: 0.7;
  }
</style>
