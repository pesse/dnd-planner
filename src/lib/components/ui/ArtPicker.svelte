<script lang="ts">
  /**
   * Nummern-Leiste über einem Bild mit mehreren Fassungen; Shift+←/→ blättert. Blendet sich nach
   * `HIDE_MS` aus und kommt bei Mouse-Over von `area` oder einem Bildwechsel zurück.
   */
  let { count, index, onpick, area, wrapped = $bindable(false) }: {
    count: number;
    index: number;
    onpick: (index: number) => void;
    area?: HTMLElement;
    /** Braucht die Leiste in der gegebenen Breite mehr als eine Zeile? */
    wrapped?: boolean;
  } = $props();

  const HIDE_MS = 2000;

  let root = $state<HTMLElement>();
  $effect(() => {
    const el = root;
    if (!el) return;
    let frame = 0;
    // Erst im nächsten Frame: `wrapped` stellt das Layout um, im Callback selbst meldete der
    // Browser „ResizeObserver loop completed with undelivered notifications".
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const first = el.firstElementChild as HTMLElement | null;
        const last = el.lastElementChild as HTMLElement | null;
        const next = !!first && !!last && last.offsetTop > first.offsetTop;
        if (next !== wrapped) wrapped = next;
      });
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  });

  let visible = $state(true);
  let hovered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function reveal() {
    visible = true;
    clearTimeout(timer);
    if (!hovered) timer = setTimeout(() => (visible = false), HIDE_MS);
  }

  $effect(() => {
    void index;
    reveal();
  });
  $effect(() => () => clearTimeout(timer));

  $effect(() => {
    const el = area;
    if (!el) return;
    el.addEventListener('pointermove', reveal);
    return () => el.removeEventListener('pointermove', reveal);
  });

  function hover(on: boolean) {
    hovered = on;
    reveal();
  }

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

<div
  class="picker"
  class:hidden={!visible}
  role="tablist"
  aria-label="Bilder"
  tabindex="-1"
  bind:this={root}
  onpointerenter={() => hover(true)}
  onpointerleave={() => hover(false)}
  onfocusin={() => hover(true)}
  onfocusout={() => hover(false)}
>
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
    transition: opacity 300ms;
  }
  .picker.hidden { opacity: 0; pointer-events: none; }
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
