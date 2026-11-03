<script lang="ts" module>
  /** Über das Schließen der Karte hinweg: wer mitten in der Session eine andere Seite ansieht, findet die Würfel wieder offen. */
  let diceOpen = $state(false);
</script>

<script lang="ts">
  /** SL-Ansicht einer Kampfkarte als Vollbild-Overlay. Speichert selbst — eine Karte im Spiel hat keinen Entwurf. */
  import { onDestroy } from 'svelte';
  import { activeFile } from '../../stores/campaign';
  import FileTitle from '../FileTitle.svelte';
  import { deleteActiveEntry } from '../../services/deleteEntry';
  import { navigateBack, navigateHome, navigateTo } from '../../services/navigation';
  import { interceptNavigation } from '../../services/entryPeek';
  import { campaignDirOf } from '../../services/battleMap/tokenDetails';
  import type { FileEntry } from '../../types';
  import { navHistoryState } from '../../stores/navigationHistory';
  import { cockpit } from '../../services/battleMap/cockpitTab.svelte';
  import { MapEditor, type MapTool } from '../../services/battleMap/mapEditor.svelte';
  import { openPlayerWindow } from '../../services/battleMap/playerWindow';
  import MapCanvas from './MapCanvas.svelte';
  import TokenPanel from './TokenPanel.svelte';
  import TokenListPanel from './TokenListPanel.svelte';
  import MapSettingsPanel from './MapSettingsPanel.svelte';
  import InitiativePanel from './InitiativePanel.svelte';
  import DiceTray from './DiceTray.svelte';
  import MapDetailsPanel from './details/MapDetailsPanel.svelte';

  const editor = new MapEditor();
  let canvas = $state<MapCanvas>();

  const TOOLS: { id: MapTool; icon: string; label: string; key: string }[] = [
    { id: 'select', icon: '✋', label: 'Auswählen & verschieben', key: 'v' },
    { id: 'view', icon: '📺', label: 'Spieler-Ausschnitt: aufziehen, verschieben, an den Ecken oder mit dem Mausrad skalieren', key: 's' },
    { id: 'reveal-rect', icon: '▢', label: 'Aufdecken (Rechteck)', key: 'a' },
    { id: 'reveal-brush', icon: '🖌', label: 'Aufdecken (Pinsel)', key: 'p' },
    { id: 'cover-rect', icon: '▣', label: 'Zudecken (Rechteck)', key: 'z' },
    { id: 'cover-brush', icon: '🖍', label: 'Zudecken (Pinsel)', key: 'x' },
    { id: 'light', icon: '🔥', label: 'Licht setzen / verschieben', key: 'l' },
    { id: 'ruler', icon: '📏', label: 'Abstand messen', key: 'm' },
    { id: 'grid', icon: '#', label: 'Raster an einem Feld ausrichten', key: 'r' },
  ];

  $effect(() => {
    const path = $activeFile?.path;
    if (path) void editor.load(path);
  });

  onDestroy(() => void editor.destroy());
  onDestroy(interceptNavigation((entry) => editor.details.show({ kind: 'entry', entry })));

  const SAVE_LABEL = { saved: 'Gespeichert', saving: 'Speichert…', unsaved: 'Ungespeichert' } as const;

  const center = () => {
    const r = canvas?.visible() ?? { x: 0, y: 0, w: 0, h: 0 };
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  async function openPlayer() {
    try {
      await openPlayerWindow();
    } catch (e) {
      editor.error = `Spielerfenster konnte nicht geöffnet werden: ${e}`;
    }
  }

  // Erst schreiben: das Schließen nach dem Löschen würde einen offenen Stand sonst wieder anlegen.
  async function remove() {
    await editor.saver.flush();
    await deleteActiveEntry(editor.map?.name ?? 'Karte');
  }

  async function leaveTo(entry: FileEntry) {
    await editor.saver.flush();
    await navigateTo(entry, { leavePeek: true });
  }

  async function close() {
    await editor.saver.flush();
    if ($navHistoryState.canBack) await navigateBack();
    else await navigateHome();
  }

  /** Maus-Zurück und Alt+← blättern im Detailbereich; die Karte verlässt man nur über ✕ — sonst endet ein Fehlklick mitten in der Session. */
  function onhistorymouse(e: MouseEvent) {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.button === 3) editor.details.back();
  }

  function onhistorykey(e: KeyboardEvent) {
    if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'ArrowLeft') editor.details.back();
  }

  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('input, select, textarea, [contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      editor.redo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const sel = editor.selected;
    if (sel && (e.key === 'Delete' || e.key === 'Backspace')) editor.removeToken(sel.id);
    else if (sel && e.key.toLowerCase() === 'h') editor.toggleHidden(sel.id); else if (e.key.toLowerCase() === 'w') {
      diceOpen = !diceOpen;
    } else if (e.key === 'Escape') {
      if (editor.tool === 'select') editor.selectedId = null;
      editor.tool = 'select';
    } else {
      const tool = TOOLS.find((t) => t.key === e.key.toLowerCase());
      if (tool) editor.tool = tool.id;
    }
  }
</script>

<svelte:window {onkeydown} onkeydowncapture={onhistorykey} onmousedowncapture={onhistorymouse} />

<!-- `main`: dort hängen die Werkzeugleisten-Regeln aus toolbar.css. -->
<div class="main map-overlay" role="dialog" aria-modal="true" aria-label="Kampfkarte">
  <div class="toolbar">
    <FileTitle label={editor.map?.name ?? $activeFile?.name ?? ''} />
    <div class="toolbar-sep"></div>
    <span class="save-state">{SAVE_LABEL[editor.saver.status]}</span>
    <button onclick={openPlayer} title="Spielerfenster öffnen — auf Beamer oder Zweitmonitor ziehen">📺 Spielerfenster</button>
    <button
      disabled={!editor.map}
      onclick={() => editor.setPlayerView(canvas?.visible() ?? null)}
      title="Die Spieler sehen genau meinen aktuellen Ausschnitt — fein einstellen mit dem Werkzeug 📺 (S)"
    >Meine Ansicht senden</button>
    <button disabled={!editor.map} onclick={() => editor.setPlayerView(null)} title="Die Spieler sehen die ganze Karte">Ganze Karte</button>
    <button class="delete-entry" onclick={remove}>🗑 Löschen</button>
    <button onclick={close} title="Karte schließen">✕</button>
  </div>

  {#if editor.error}
    <div class="error" role="alert">
      {editor.error}
      <button onclick={() => (editor.error = '')}>✕</button>
    </div>
  {/if}

  {#if editor.map}
    <div class="body">
      <div class="tools" role="toolbar" aria-label="Werkzeuge">
        {#each TOOLS as t}
          <button class:active={editor.tool === t.id} title="{t.label} ({t.key.toUpperCase()})" onclick={() => (editor.tool = t.id)}>{t.icon}</button>
        {/each}
        <div class="sep"></div>
        <button title="Alles aufdecken" onclick={() => editor.setFogAll(true)}>☀</button>
        <button title="Alles zudecken" onclick={() => editor.setFogAll(false)}>☾</button>
        <div class="sep"></div>
        <button title="Rückgängig (Strg+Z)" onclick={() => editor.undo()}>↩</button>
        <button title="Wiederherstellen (Strg+Y)" onclick={() => editor.redo()}>↪</button>
        <button title="Ganze Karte zeigen" onclick={() => canvas?.fit()}>⤢</button>
        <div class="sep"></div>
        <button class:active={diceOpen} title="Würfel (W)" onclick={() => (diceOpen = !diceOpen)}>🎲</button>
      </div>

      <aside class="panel left" aria-label="Werkzeuge und Einstellungen">
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={cockpit.tab === 'prep'} onclick={() => (cockpit.tab = 'prep')}>Vorbereitung</button>
          <button role="tab" aria-selected={cockpit.tab === 'play'} onclick={() => (cockpit.tab = 'play')}>Spiel</button>
        </div>
        <div class="tab" role="tabpanel" hidden={cockpit.tab !== 'prep'}>
          <TokenPanel {editor} {center} />
          <TokenListPanel {editor} />
          <MapSettingsPanel {editor} />
        </div>
        <div class="tab" role="tabpanel" hidden={cockpit.tab !== 'play'}>
          <InitiativePanel {editor} campaignDir={campaignDirOf(editor.path)} />
          <TokenListPanel {editor} />
        </div>
      </aside>

      <MapCanvas bind:this={canvas} {editor} />

      {#if diceOpen}<DiceTray onclose={() => (diceOpen = false)} />{/if}

      <aside class="panel right" aria-label="Details">
        <MapDetailsPanel {editor} campaignDir={campaignDirOf(editor.path)} {center} onleave={leaveTo} />
      </aside>
    </div>
  {/if}
</div>

<style>
  .map-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--ink);
  }
  .save-state {
    align-self: center;
    font-size: 0.75rem;
    color: var(--ink-muted);
    margin-right: 0.5rem;
  }
  .error {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.4rem 1rem;
    background: var(--danger);
    color: var(--on-accent);
    font-size: 0.85rem;
    position: relative;
    z-index: 2;
  }
  .error button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
    z-index: 2;
  }
  .tools {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.4rem 0.3rem;
    background: var(--bg-panel);
    border-right: 1px solid var(--surface);
  }
  .tools button {
    width: 2.1rem;
    height: 2.1rem;
    font-size: 1rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tools button:hover {
    border-color: var(--border);
  }
  .tools button.active {
    background: var(--surface);
    border-color: var(--red);
    color: var(--red);
  }
  .sep {
    height: 1px;
    margin: 0.2rem 0;
    background: var(--border);
  }
  .panel {
    flex-shrink: 0;
    background: var(--bg-panel);
  }
  .left {
    width: 16rem;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--surface);
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    flex: 1;
    padding: 0.5rem 0;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ink-muted);
    font-family: var(--font-display);
    cursor: pointer;
  }
  .tabs button[aria-selected='true'] {
    color: var(--red);
    border-bottom-color: var(--red);
  }
  .tab {
    flex: 1;
    overflow-y: auto;
  }
  .tab[hidden] {
    display: none;
  }
  .right {
    width: clamp(20rem, 26vw, 28rem);
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--surface);
  }
</style>
