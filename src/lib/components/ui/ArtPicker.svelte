<script lang="ts">
  /** Nummern-Leiste über einem Bild mit mehreren Fassungen; Shift+←/→ blättert. */
  let { count, index, onpick }: {
    count: number;
    index: number;
    onpick: (index: number) => void;
  } = $props();

  const editable = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

  function onkeydown(e: KeyboardEvent) {
    if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || editable(e.target)) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    onpick((index + (e.key === 'ArrowRight' ? 1 : -1) + count) % count);
  }
</script>

<svelte:window {onkeydown} />

<div class="picker" role="tablist" aria-label="Bilder">
  {#each { length: count } as _, i (i)}
    <button
      type="button"
      role="tab"
      aria-selected={i === index}
      class:current={i === index}
      title="Bild {i + 1} (Shift+←/→)"
      onclick={() => onpick(i)}
    >{i + 1}</button>
  {/each}
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2rem;
    width: max-content;
    max-width: 100%;
    padding: 0.2rem;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--bg-raised) 82%, transparent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--ink) 20%, transparent);
    pointer-events: auto;
  }
  button {
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.3rem;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  button:hover { color: var(--red); }
  button.current { background: var(--red); color: var(--on-accent); }
</style>
