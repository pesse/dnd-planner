<script lang="ts">
  /** Kartenbild, Raster, Nebel-Pinsel und Licht. */
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import PanelSection from './PanelSection.svelte';
  import MapLevelsSection from './MapLevelsSection.svelte';
  import MapImageGenerator from './MapImageGenerator.svelte';
  import { levelName } from '../../services/battleMap/levels';

  let { editor }: { editor: MapEditor } = $props();

  const map = $derived(editor.map!);
  const layer = $derived(editor.layer);

  function num(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value);
  }
</script>

<PanelSection title={map.levels.length ? `Karte · ${levelName(map, editor.level)}` : 'Karte'}>
  <span class="pair">
    <button onclick={() => editor.chooseImage()}>{layer.image ? 'Bild ersetzen…' : 'Kartenbild wählen…'}</button>
    <MapImageGenerator {editor} />
  </span>
  <label>
    <span>Nebel aktiv</span>
    <input type="checkbox" checked={layer.fog.enabled} onchange={(e) => { editor.checkpoint(); layer.fog.enabled = e.currentTarget.checked; editor.changed(); }} />
  </label>
  {#if editor.tool === 'reveal-brush' || editor.tool === 'cover-brush'}
    <label>
      <span>Pinsel</span>
      <input type="range" min="10" max={Math.max(200, map.grid.size * 6)} bind:value={editor.brushRadius} />
    </label>
  {/if}
</PanelSection>

<MapLevelsSection {editor} />

<PanelSection title="Raster" open={false}>
  <label>
    <span>Sichtbar</span>
    <input type="checkbox" checked={map.grid.visible} onchange={(e) => { map.grid.visible = e.currentTarget.checked; editor.changed(); }} />
  </label>
  <label>
    <span>Feldgröße (px)</span>
    <input type="number" min="4" step="0.5" value={map.grid.size} onfocus={() => editor.checkpoint()} oninput={(e) => { if (num(e) >= 4) { map.grid.size = num(e); editor.changed(); } }} />
  </label>
  <label>
    <span>Versatz X / Y</span>
    <span class="pair">
      <input type="number" step="0.5" value={map.grid.offsetX} onfocus={() => editor.checkpoint()} oninput={(e) => { map.grid.offsetX = num(e); editor.changed(); }} />
      <input type="number" step="0.5" value={map.grid.offsetY} onfocus={() => editor.checkpoint()} oninput={(e) => { map.grid.offsetY = num(e); editor.changed(); }} />
    </span>
  </label>
  <label>
    <span>Deckkraft</span>
    <input type="range" min="0" max="1" step="0.05" value={map.grid.opacity} oninput={(e) => { map.grid.opacity = num(e); editor.changed(); }} />
  </label>
  <label>
    <span>Meter pro Feld</span>
    <input type="number" min="0.5" step="0.5" value={map.grid.metersPerCell} oninput={(e) => { if (num(e) > 0) { map.grid.metersPerCell = num(e); editor.changed(); } }} />
  </label>
  <p class="hint">Werkzeug „Raster“: genau ein Feld der Karte aufziehen.</p>
</PanelSection>

<PanelSection title="Licht">
  <label>
    <span>Dunkelheit</span>
    <input type="range" min="0" max="1" step="0.05" value={layer.lighting.darkness} onpointerdown={() => editor.checkpoint()} oninput={(e) => { layer.lighting.darkness = num(e); editor.changed(); }} />
  </label>
  <p class="hint">Werkzeug „Licht“: auf die Karte klicken. Jedes Licht ist ein Token — Farbe, Reichweite und Sichtbarkeit stellst du dort ein.</p>
</PanelSection>

<style>
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  label input[type='number'] {
    width: 4rem;
  }
  .pair input[type='number'] {
    width: 3.4rem;
  }
  label input[type='range'] {
    width: 50%;
  }
  .pair {
    display: flex;
    gap: 0.25rem;
  }
  button, .pair :global(> button) {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
  }
  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
</style>
