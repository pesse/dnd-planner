<script lang="ts">
  /** Kopfleiste der Kampfkarte; Vorlage und Spielkarte unterscheiden sich in Farbe und Aktionen. */
  import { activeFile } from '../../stores/campaign';
  import FileTitle from '../FileTitle.svelte';
  import { deleteActiveEntry } from '../../services/deleteEntry';
  import { navigateBack, navigateHome, navigateTo, replaceActive } from '../../services/navigation';
  import { campaignDirOf } from '../../services/battleMap/tokenDetails';
  import type { BattleMap } from '../../schemas/battleMap';
  import type { ViewRect } from '../../schemas/battleMap';
  import { navHistoryState } from '../../stores/navigationHistory';
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { openPlayerWindow } from '../../services/battleMap/playerWindow';
  import { hideHandout, playerHandout } from '../../services/handouts/playerHandout.svelte';
  import { mapFromTemplate, renameMap, saveAsMapTemplate } from '../../services/battleMap/mapTemplates';
  import { askMapPlacement, type MapPlacement } from '../../services/battleMap/mapPlacement';
  import { campaignTree } from '../sidebar/campaign/campaignTreeState.svelte';

  let { editor, isTemplate, visible }: {
    editor: MapEditor;
    isTemplate: boolean;
    visible: () => ViewRect | null;
  } = $props();

  const SAVE_LABEL = { saved: 'Gespeichert', saving: 'Speichert…', unsaved: 'Ungespeichert' } as const;

  let templateSaved = $state(false);

  async function openPlayer() {
    try {
      await openPlayerWindow();
    } catch (e) {
      editor.error = `Spielerfenster konnte nicht geöffnet werden: ${e}`;
    }
  }

  async function askPlacement(title: string, withAct: boolean): Promise<MapPlacement | null> {
    await editor.saver.flush();
    if (!campaignTree.campaigns.length) await campaignTree.loadCampaigns();
    return askMapPlacement({
      title,
      name: editor.map!.name,
      campaign: campaignDirOf(editor.path).split('/').pop()!,
      campaigns: campaignTree.campaigns,
      withAct,
    });
  }

  async function saveTemplate() {
    try {
      const to = await askPlacement('Als Vorlage speichern', false);
      const path = to && (await saveAsMapTemplate(editor.path, $state.snapshot(editor.map!) as BattleMap, to));
      if (!path) return;
      await campaignTree.refreshSectionOf(path);
      templateSaved = true;
      setTimeout(() => (templateSaved = false), 3000);
    } catch (e) {
      editor.error = `Vorlage konnte nicht gespeichert werden: ${e}`;
    }
  }

  async function mapFromThis() {
    try {
      const to = await askPlacement('Karte aus Vorlage anlegen', true);
      const path = to && (await mapFromTemplate(editor.path, $state.snapshot(editor.map!) as BattleMap, to));
      if (!path) return;
      await campaignTree.refreshSectionOf(path);
      await navigateTo({ name: to.name, path, type: 'map' }, { leavePeek: true });
    } catch (e) {
      editor.error = `Karte konnte nicht angelegt werden: ${e}`;
    }
  }

  /** Der Editor lädt danach vom neuen Pfad — das Rückgängig der Karte beginnt dabei von vorn. */
  async function rename(name: string) {
    if (!editor.map || name === editor.map.name || !$activeFile) return;
    try {
      await editor.saver.flush();
      const path = await renameMap(editor.path, $state.snapshot(editor.map) as BattleMap, name);
      if (!path) return;
      replaceActive({ ...$activeFile, name, path });
      await campaignTree.refreshSectionOf(path);
    } catch (e) {
      editor.error = `Umbenennen fehlgeschlagen: ${e}`;
    }
  }

  // Erst schreiben: das Schließen nach dem Löschen würde einen offenen Stand sonst wieder anlegen.
  async function remove() {
    await editor.saver.flush();
    await deleteActiveEntry(editor.map?.name ?? 'Karte');
  }

  async function close() {
    await editor.saver.flush();
    if ($navHistoryState.canBack) await navigateBack();
    else await navigateHome();
  }
</script>

<div class="toolbar map-toolbar" class:template={isTemplate}>
  <span class="kind">{isTemplate ? 'Kartenvorlage' : 'Karte'}</span>
  <FileTitle label={editor.map?.name ?? $activeFile?.name ?? ''} renamable={!!editor.map} onrename={rename} />
  <span class="save-state" class:pending={editor.saver.status !== 'saved'}>{SAVE_LABEL[editor.saver.status]}</span>
  <div class="toolbar-sep"></div>

  {#if isTemplate}
    <button
      class="primary"
      disabled={!editor.map}
      onclick={mapFromThis}
      title="Legt eine neue Karte aus dieser Vorlage an — Name, Kampagne und Akt wählst du im nächsten Schritt"
    >🗺 Karte daraus anlegen</button>
  {:else}
    <div class="group" role="group" aria-label="Spielerfenster">
      <span class="group-label">Spieler</span>
      <button onclick={openPlayer} title="Spielerfenster öffnen — auf Beamer oder Zweitmonitor ziehen">📺 Fenster öffnen</button>
      <button
        disabled={!editor.map}
        onclick={() => editor.setPlayerView(visible())}
        title="Die Spieler sehen genau meinen aktuellen Ausschnitt — fein einstellen mit dem Werkzeug 📺 (S)"
      >Mein Ausschnitt</button>
      <button disabled={!editor.map} onclick={() => editor.setPlayerView(null)} title="Die Spieler sehen die ganze Karte">Ganze Karte</button>
      {#if playerHandout.current}
        <button
          class="attention"
          onclick={hideHandout}
          title="Nimmt Handout oder Monsterbild aus dem Spielerfenster — die Spieler sehen wieder die Karte"
        >🗺 Karte statt Handout</button>
      {/if}
    </div>
    <button
      disabled={!editor.map}
      onclick={saveTemplate}
      title="Speichert die Karte unter „Kartenvorlagen“ — ohne Spieler-Charaktere, Monster versteckt und unverletzt, Nebel zu. Name und Kampagne wählst du im nächsten Schritt."
    >{templateSaved ? '✓ Vorlage gespeichert' : '📑 Als Vorlage'}</button>
  {/if}

  <div class="end">
    <button class="icon danger" onclick={remove} title={isTemplate ? 'Vorlage löschen' : 'Karte löschen'} aria-label="Löschen">🗑</button>
    <button class="icon" onclick={close} title="Karte schließen" aria-label="Schließen">✕</button>
  </div>
</div>

<style>
  .map-toolbar {
    --map-tint: var(--red);
    align-items: center;
    gap: 0.4rem;
    background: color-mix(in srgb, var(--map-tint) 9%, var(--bg-panel));
    border-bottom-color: color-mix(in srgb, var(--map-tint) 35%, var(--surface));
  }
  .map-toolbar.template {
    --map-tint: var(--steel);
  }
  .kind {
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: var(--map-tint);
    color: var(--on-accent);
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .save-state {
    font-size: 0.75rem;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  .save-state.pending {
    color: var(--ink-soft);
    font-style: italic;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.2rem 0.15rem 0.55rem;
    border: 1px solid color-mix(in srgb, var(--map-tint) 25%, var(--border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
  }
  .group-label {
    margin-right: 0.2rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-muted);
  }
  .map-toolbar button:hover:not(:disabled) {
    border-color: var(--map-tint);
    color: var(--ink);
  }
  .map-toolbar button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .map-toolbar .primary {
    background: var(--map-tint);
    border-color: var(--map-tint);
    color: var(--on-accent);
  }
  .map-toolbar .primary:hover:not(:disabled) {
    color: var(--on-accent);
    filter: brightness(1.12);
  }
  .map-toolbar .attention {
    border-color: var(--gold);
    color: var(--gold);
  }
  .end {
    display: flex;
    gap: 0.25rem;
    margin-left: 0.5rem;
    padding-left: 0.6rem;
    border-left: 1px solid color-mix(in srgb, var(--map-tint) 25%, var(--border));
  }
  .map-toolbar .icon {
    width: 2rem;
    padding: 0.25rem 0;
    border-color: transparent;
  }
  .map-toolbar .icon.danger:hover {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--on-accent);
  }
</style>
