<script lang="ts">
  /** Stockwerke anlegen, benennen, ausrichten und löschen; Bild, Nebel und Licht der gewählten Ebene stehen im Abschnitt „Karte". */
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { BASE_LEVEL, levelStack, tokensOn } from '../../services/battleMap/levels';
  import { confirmAction } from '../../stores/confirmDialog';
  import PanelSection from './PanelSection.svelte';

  let { editor }: { editor: MapEditor } = $props();

  const map = $derived(editor.map!);
  const stack = $derived(levelStack(map));
  const current = $derived(map.levels.find((l) => l.id === editor.level) ?? null);

  function rename(id: string, name: string) {
    editor.checkpoint();
    if (id === BASE_LEVEL) map.baseLevelName = name.trim();
    else {
      const level = map.levels.find((l) => l.id === id);
      if (level) level.name = name.trim() || level.name;
    }
    editor.changed();
  }

  async function remove(id: string, name: string) {
    const count = tokensOn([...map.tokens, ...map.parkedTokens], id).length;
    const ok = await confirmAction({
      title: 'Ebene löschen?',
      message: `„${name}" wird entfernt${count ? `, mit ${count} Token${count === 1 ? '' : 's'} darauf` : ''}. Das Bild bleibt im Kartenordner liegen.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (ok) editor.removeLevel(id);
  }

  const num = (e: Event): number => Number((e.currentTarget as HTMLInputElement).value);
</script>

<PanelSection title="Ebenen" open={map.levels.length > 0}>
  {#if map.levels.length}
    {#each stack as l (l.id)}
      <div class="level" class:active={l.id === editor.level}>
        <button class="pick" title="Ebene anzeigen" onclick={() => (editor.level = l.id)}>{l.elevation > 0 ? `+${l.elevation}` : l.elevation}</button>
        <input value={l.id === BASE_LEVEL ? map.baseLevelName : l.name} placeholder={l.name} aria-label="Name der Ebene" onchange={(e) => rename(l.id, e.currentTarget.value)} />
        {#if l.id !== BASE_LEVEL}
          <button class="del" title={`Ebene „${l.name}“ löschen`} onclick={() => remove(l.id, l.name)}>✕</button>
        {/if}
      </div>
    {/each}
    {#if current}
      <label>
        <span>Lage X / Y (px)</span>
        <span class="pair">
          <input type="number" step="1" value={current.offsetX} onfocus={() => editor.checkpoint()} oninput={(e) => { current.offsetX = num(e); editor.changed(); }} />
          <input type="number" step="1" value={current.offsetY} onfocus={() => editor.checkpoint()} oninput={(e) => { current.offsetY = num(e); editor.changed(); }} />
        </span>
      </label>
      <p class="hint">Linke obere Ecke des Ebenenbilds auf der Grundebene. Gleicher Maßstab wie dort; transparente Stellen zeigen die Ebene darunter.</p>
    {/if}
  {:else}
    <p class="hint">Obergeschoss, Keller, Gruft: jede Ebene hat ihr eigenes Bild, Nebel und Licht. Teilkarten sind möglich.</p>
  {/if}
  <div class="add">
    <button onclick={() => editor.addLevel(1)}>+ Ebene darüber</button>
    <button onclick={() => editor.addLevel(-1)}>+ Ebene darunter</button>
  </div>
</PanelSection>

<style>
  .level {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 1px;
    border-radius: 4px;
  }
  .level.active {
    background: color-mix(in srgb, var(--gold) 25%, transparent);
  }
  .level input {
    flex: 1;
    min-width: 0;
  }
  .pick {
    min-width: 2.2rem;
    font-variant-numeric: tabular-nums;
  }
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .pair {
    display: flex;
    gap: 0.25rem;
  }
  .pair input {
    width: 4rem;
  }
  .add {
    display: flex;
    gap: 0.3rem;
  }
  .add button {
    flex: 1;
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
