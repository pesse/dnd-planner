<script lang="ts">
  /** Macht ein Token zur Lichtquelle, die mit ihm wandert; Reichweite frei oder nach typischer Quelle. */
  import type { Grid, Token, TokenLight } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';

  let { editor, token: t, grid }: { editor: MapEditor; token: Token; grid: Grid } = $props();

  /** Gesamtreichweite aus hellem plus dämmrigem Licht (SRD). */
  const FIRE = '#ffb347';
  const SOURCES = [
    { label: 'Kerze', meters: 3, color: FIRE },
    { label: 'Fackel', meters: 12, color: FIRE },
    { label: 'Laterne', meters: 18, color: FIRE },
    { label: 'Magisch', meters: 12, color: '#e6eeff' },
  ];

  const cells = (meters: number) => meters / grid.metersPerCell;
  const meters = (light: TokenLight) => Math.round(light.radius * grid.metersPerCell * 2) / 2;

  function set(light: TokenLight | null) {
    editor.checkpoint();
    editor.setTokenLight(t.id, light);
  }

  const toggle = () => set(t.light ? null : { radius: cells(12), color: FIRE });
</script>

<div class="light">
  <label class="switch">
    <input type="checkbox" checked={!!t.light} onchange={toggle} />
    Licht
  </label>
  {#if t.light}
    {@const light = t.light}
    <input type="color" value={light.color} title="Farbe" onchange={(e) => set({ ...light, color: e.currentTarget.value })} />
    <input
      type="range"
      min="0.5"
      max="36"
      step="0.5"
      value={meters(light)}
      title="Reichweite"
      onpointerdown={() => editor.checkpoint()}
      oninput={(e) => editor.setTokenLight(t.id, { ...light, radius: cells(Number(e.currentTarget.value)) })}
    />
    <span class="reach">{meters(light).toLocaleString('de-DE')} m</span>
    <div class="sources">
      {#each SOURCES as s (s.label)}
        <button class:on={meters(light) === s.meters && light.color === s.color} onclick={() => set({ radius: cells(s.meters), color: s.color })}>{s.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .light {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  input[type='color'] {
    width: 2rem;
    padding: 0;
  }
  input[type='range'] {
    flex: 1;
    min-width: 5rem;
  }
  .reach {
    min-width: 3.5ch;
    color: var(--ink-muted);
  }
  .sources {
    display: flex;
    gap: 0.25rem;
    width: 100%;
  }
  button {
    padding: 0.05rem 0.5rem;
    font-size: 0.72rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  button.on {
    border-color: #c07a1a;
    color: #c07a1a;
  }
</style>
