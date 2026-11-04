<script lang="ts">
  /** Griff zwischen Seitenleiste und Karte: ziehen ändert die Breite, die Lasche klappt die Leiste zu. */
  import type { PanelLayout } from '../../utils/panelLayout.svelte';

  let { layout, side, label }: { layout: PanelLayout; side: 'left' | 'right'; label: string } = $props();

  const arrow = $derived(layout.collapsed ? '☰' : side === 'left' ? '‹' : '›');
</script>

<div class="edge {side}" class:collapsed={layout.collapsed}>
  {#if !layout.collapsed}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="grip" role="separator" aria-orientation="vertical" aria-label="{label} verbreitern" onmousedown={layout.startResize}></div>
  {/if}
  <button class="tab" title={layout.collapsed ? `${label} öffnen` : `${label} schließen`} onclick={layout.toggle}>{arrow}</button>
</div>

<style>
  .edge {
    position: relative;
    flex-shrink: 0;
    width: 4px;
    background: var(--surface);
    z-index: 15;
  }
  .edge.collapsed {
    width: 0;
  }
  .grip {
    position: absolute;
    inset: 0;
    cursor: col-resize;
    transition: background 0.15s;
  }
  .grip:hover,
  .grip:active {
    background: var(--red);
  }
  .tab {
    position: absolute;
    top: 25%;
    width: 22px;
    min-height: 64px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--bg-panel);
    color: var(--ink-muted);
    border: 1px solid var(--surface);
    cursor: pointer;
    font-size: 1.05rem;
    line-height: 1;
    transition: color 0.1s, background 0.1s;
  }
  .tab:hover {
    color: var(--arcane);
    background: var(--surface);
  }
  .left .tab {
    left: 100%;
    border-left: none;
    border-radius: 0 8px 8px 0;
    box-shadow: 2px 0 6px rgba(0, 0, 0, 0.15);
  }
  .right .tab {
    right: 100%;
    border-right: none;
    border-radius: 8px 0 0 8px;
    box-shadow: -2px 0 6px rgba(0, 0, 0, 0.15);
  }
</style>
