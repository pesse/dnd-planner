<script lang="ts" module>
  export interface TooltipOption {
    value: string;
    label: string;
    /** Optionale Konsequenz-Erklärung, als Schwebe-Tooltip beim Überfahren gezeigt. */
    tooltip?: string;
  }
</script>

<script lang="ts">
  /**
   * Wiederverwendbares Dropdown mit Schwebe-Tooltip je Option — dieselbe Cursor-Karte
   * wie die Talente-Auswahl im Charakter-Editor (FeatTooltip-Muster). Ein natives
   * <select> kann keine Hover-Events je <option> feuern, darum ein Button-Popup.
   *
   * Einfach- und Mehrfachauswahl über `multiple`; die Auswahl ist immer ein string[]
   * (bei Einfachwahl mit 0/1 Einträgen), damit der Aufrufer nur einen Typ kennt.
   */
  let {
    options,
    selected = [],
    multiple = false,
    max = 0,
    placeholder = '— bitte wählen —',
    onchange,
  }: {
    options: TooltipOption[];
    selected?: string[];
    multiple?: boolean;
    /** Obergrenze bei Mehrfachwahl (0 = unbegrenzt). */
    max?: number;
    placeholder?: string;
    onchange: (selected: string[]) => void;
  } = $props();

  let open = $state(false);
  let tip = $state('');
  let tipX = $state(0);
  let tipY = $state(0);
  let winW = $state(1280);
  let winH = $state(800);
  let tipW = $state(0);
  let tipH = $state(0);
  const tipLeft = $derived(tipX + tipW > winW ? Math.max(8, tipX - tipW - 28) : tipX);
  const tipTop = $derived(Math.max(8, Math.min(tipY, winH - tipH - 8)));

  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const triggerText = $derived(
    selected.length ? selected.map(labelOf).join(', ') : placeholder,
  );

  function showTip(e: MouseEvent, text: string) {
    if (!text) return;
    tip = text;
    tipX = e.clientX + 14;
    tipY = e.clientY + 14;
  }
  function moveTip(e: MouseEvent) {
    if (!tip) return;
    tipX = e.clientX + 14;
    tipY = e.clientY + 14;
  }
  function hideTip() { tip = ''; }

  function select(e: MouseEvent, value: string) {
    // preventDefault hält den Fokus am Trigger → bei Mehrfachwahl bleibt die Liste offen.
    e.preventDefault();
    if (multiple) {
      const set = new Set(selected);
      if (set.has(value)) set.delete(value);
      else if (!max || selected.length < max) set.add(value);
      else return;
      onchange([...set]);
    } else {
      onchange([value]);
      open = false;
      hideTip();
    }
  }
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

<div class="dropdown">
  <button
    type="button"
    class="dd-trigger"
    class:placeholder={!selected.length}
    onclick={() => (open = !open)}
    onblur={() => setTimeout(() => (open = false), 150)}
  >
    <span class="dd-text">{triggerText}</span>
    <span class="dd-arrow" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="dd-list">
      {#each options as opt}
        <button
          type="button"
          class="dd-opt"
          class:sel={selected.includes(opt.value)}
          onmousedown={(e) => select(e, opt.value)}
          onmouseenter={(e) => showTip(e, opt.tooltip ?? '')}
          onmousemove={moveTip}
          onmouseleave={hideTip}
        >
          {#if multiple}<span class="dd-check" aria-hidden="true">{selected.includes(opt.value) ? '☑' : '☐'}</span>{/if}
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if tip}
  <div class="opt-tooltip" style="left:{tipLeft}px;top:{tipTop}px" bind:clientWidth={tipW} bind:clientHeight={tipH}>{tip}</div>
{/if}

<style>
  .dropdown { position: relative; }
  .dd-trigger {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    background: var(--bg-raised); color: var(--ink); border: 1px solid var(--border);
    border-radius: 5px; padding: 0.45rem 0.55rem; font: inherit; cursor: pointer; text-align: left;
  }
  .dd-trigger:hover, .dd-trigger:focus { outline: none; border-color: var(--border-strong); }
  .dd-trigger.placeholder .dd-text { color: var(--ink-muted); }
  .dd-arrow { flex: 0 0 auto; color: var(--ink-muted); font-size: 0.75rem; }
  .dd-list {
    position: absolute; z-index: 50; top: calc(100% + 2px); left: 0; right: 0;
    display: flex; flex-direction: column; max-height: 15rem; overflow-y: auto;
    background: var(--bg-panel); border: 1px solid var(--border-strong); border-radius: 5px;
    box-shadow: 0 8px 24px rgba(20, 12, 2, 0.35);
  }
  .dd-opt {
    display: flex; align-items: center; gap: 0.5rem; text-align: left;
    background: none; border: none; color: var(--ink);
    padding: 0.4rem 0.6rem; font: inherit; cursor: pointer;
  }
  .dd-opt:hover { background: var(--surface); }
  .dd-opt.sel { color: var(--arcane, var(--gold)); font-weight: 600; }
  .dd-check { flex: 0 0 auto; }
  .opt-tooltip {
    position: fixed; z-index: 9999; pointer-events: none;
    background: var(--bg-panel); color: var(--ink);
    border: 1px solid var(--border); border-left: 3px solid var(--gold);
    border-radius: 6px; padding: 0.45rem 0.6rem; max-width: 300px;
    box-shadow: 0 8px 24px rgba(20, 12, 2, 0.45); font-size: 0.8rem;
  }
</style>
