<script lang="ts">
  /** Kartenbild, Raster, Nebel-Pinsel und Licht. */
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';

  let { editor }: { editor: MapEditor } = $props();

  const map = $derived(editor.map!);

  function num(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value);
  }
</script>

<section>
  <h3>Karte</h3>
  <button onclick={() => editor.chooseImage()}>{map.image ? 'Bild ersetzen…' : 'Kartenbild wählen…'}</button>
  <label>
    <span>Nebel aktiv</span>
    <input type="checkbox" checked={map.fog.enabled} onchange={(e) => { editor.checkpoint(); map.fog.enabled = e.currentTarget.checked; editor.changed(); }} />
  </label>
  {#if editor.tool === 'reveal-brush' || editor.tool === 'cover-brush'}
    <label>
      <span>Pinsel</span>
      <input type="range" min="10" max={Math.max(200, map.grid.size * 6)} bind:value={editor.brushRadius} />
    </label>
  {/if}
</section>

<section>
  <h3>Raster</h3>
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
</section>

<section>
  <h3>Licht</h3>
  <label>
    <span>Dunkelheit</span>
    <input type="range" min="0" max="1" step="0.05" value={map.lighting.darkness} onpointerdown={() => editor.checkpoint()} oninput={(e) => { map.lighting.darkness = num(e); editor.changed(); }} />
  </label>
  {#each map.lighting.lights as l, i (l.id)}
    <div class="light">
      <input type="color" value={l.color} title="Farbe" onchange={(e) => { editor.checkpoint(); l.color = e.currentTarget.value; editor.changed(); }} />
      <input type="range" min="1" max="20" step="0.5" value={l.radius} title="Reichweite {l.radius} Felder" onpointerdown={() => editor.checkpoint()} oninput={(e) => { l.radius = num(e); editor.changed(); }} />
      <span class="radius">{l.radius}</span>
      <button class="del" title="Licht {i + 1} entfernen" onclick={() => editor.removeLight(l.id)}>✕</button>
    </div>
  {:else}
    <p class="hint">Werkzeug „Licht“: auf die Karte klicken. Lichter sind reine Optik.</p>
  {/each}
</section>

<style>
  section {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  h3 {
    margin: 0 0 0.2rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
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
  input[type='color'] {
    width: 2rem;
    padding: 0;
  }
  label input[type='range'] {
    width: 50%;
  }
  .pair {
    display: flex;
    gap: 0.25rem;
  }
  .light {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .light input[type='range'] {
    flex: 1;
  }
  .radius {
    font-size: 0.75rem;
    color: var(--ink-muted);
    min-width: 2ch;
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
  }
  .del {
    border: none;
    background: none;
    color: var(--danger);
  }
  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
</style>
