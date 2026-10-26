<script lang="ts">
  /**
   * Ein Bild im Charakter-Ordner: Vorschau, Datei wählen (wird in den Ordner kopiert) und
   * Verknüpfung lösen. Gespeichert wird nur der Dateiname — `baseName` bestimmt ihn, damit
   * zwei Felder im selben Ordner sich nicht überschreiben.
   */
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import { tick } from 'svelte';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import ImageGenerator from './ImageGenerator.svelte';
  import type { PortraitSource } from '../../services/imageGen/portraitPrompt';
  import type { GeneratedImage } from '../../services/imageGen/types';
  import './form.css';

  let { file = $bindable(), figureFile = $bindable(), dirPath, baseName, label, diff, portrait }: {
    file: string;
    /** Die aus dem Portrait gemalte Ganzkörperfigur; nur mit `portrait`. */
    figureFile?: string;
    dirPath: string;
    /** Dateiname ohne Endung, z. B. `portrait` → `portrait.png`. */
    baseName: string;
    /** Beschriftung des leeren Rahmens und des Bildes. */
    label: string;
    diff: DiffDir;
    /** Quelle fürs generierte Portrait; ohne sie gibt es nur die Datei-Wahl. */
    portrait?: PortraitSource;
  } = $props();

  let preview = $state('');
  let error = $state('');
  let busy = $state(false);
  let previewToken = 0;

  // Asset-Protokoll statt Base64 durch die IPC; `pick()` setzt die Vorschau danach direkt aus
  // den gelesenen Bytes, weil es sie zum Schreiben ohnehin hat.
  $effect(() => {
    if (!file) { preview = ''; return; }
    invoke<string>('get_absolute_path', { path: `${dirPath}/${file}` })
      .then((abs) => { preview = `${convertFileSrc(abs)}?v=${previewToken++}`; })
      .catch(() => { preview = ''; });
  });

  async function pick() {
    error = '';
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      busy = true;
      const src = selected as string;
      const ext = src.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      await store(await invoke<string>('read_file_base64', { path: src }), ext);
    } catch (e) {
      error = `${label} konnte nicht geladen werden: ${e}`;
    } finally {
      busy = false;
    }
  }

  async function store(b64: string, ext: 'png' | 'jpg') {
    const targetName = `${baseName}.${ext}`;
    await invoke('write_file_base64', { path: `${dirPath}/${targetName}`, data: b64 });
    file = targetName;
    preview = `data:${ext === 'png' ? 'image/png' : 'image/jpeg'};base64,${b64}`;
  }

  async function storeFigure(img: GeneratedImage) {
    const name = `figure.${img.ext}`;
    await invoke('write_file_base64', { path: `${dirPath}/${name}`, data: img.b64 });
    // Derselbe Name wie vorher lädt sonst die alte Figur nicht neu (`characterAssetUrl`).
    figureFile = '';
    await tick();
    figureFile = name;
  }

  function clear() {
    file = '';
    preview = '';
  }
</script>

<div class="image-block" use:diffMark={diff}>
  {#if preview}
    <img class="image-preview" src={preview} alt={label} />
  {:else}
    <div class="image-placeholder">Kein {label}</div>
  {/if}
  <div class="image-actions">
    <button class="btn-add" onclick={pick} disabled={busy}>
      {busy ? '…' : (file ? 'Ersetzen' : 'Bild wählen')}
    </button>
    {#if file}
      <button class="remove-btn" onclick={clear} title="Bild-Verknüpfung entfernen">✕</button>
    {/if}
    {#if portrait}
      <ImageGenerator {portrait} {dirPath} portraitFile={file} disabled={busy}
        onimage={(img) => store(img.b64, img.ext)} onfigure={storeFigure} />
    {/if}
  </div>
  {#if figureFile}
    <div class="figure-note">
      Eigene Figur im Inventar
      <button class="remove-btn" onclick={() => { figureFile = ''; }} title="Wieder die Gliederpuppe zeigen">✕</button>
    </div>
  {/if}
  {#if error}<div class="error-sm">{error}</div>{/if}
</div>
