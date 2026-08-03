<script lang="ts">
  /**
   * Portrait des Charakters: Vorschau aus dem Charakter-Ordner, Datei wählen (wird in den
   * Ordner kopiert) und Verknüpfung lösen. Gespeichert wird nur der Dateiname.
   */
  import { invoke } from '@tauri-apps/api/core';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import './form.css';

  let { portraitFile = $bindable(), dirPath, diff }: {
    portraitFile: string;
    dirPath: string;
    diff: DiffDir;
  } = $props();

  let preview = $state('');
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    if (!portraitFile) { preview = ''; return; }
    invoke<string>('read_file_base64', { path: `${dirPath}/${portraitFile}` })
      .then((b64) => {
        const mime = portraitFile.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        preview = `data:${mime};base64,${b64}`;
      })
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
      const b64 = await invoke<string>('read_file_base64', { path: src });
      const targetName = `portrait.${ext}`;
      await invoke('write_file_base64', { path: `${dirPath}/${targetName}`, data: b64 });
      portraitFile = targetName;
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      preview = `data:${mime};base64,${b64}`;
    } catch (e) {
      error = `Portrait konnte nicht geladen werden: ${e}`;
    } finally {
      busy = false;
    }
  }

  function clear() {
    portraitFile = '';
    preview = '';
  }
</script>

<div class="portrait-block" use:diffMark={diff}>
  {#if preview}
    <img class="portrait-preview" src={preview} alt="Portrait" />
  {:else}
    <div class="portrait-placeholder">Kein Portrait</div>
  {/if}
  <div class="portrait-actions">
    <button class="btn-add" onclick={pick} disabled={busy}>
      {busy ? '…' : (portraitFile ? 'Ersetzen' : 'Bild wählen')}
    </button>
    {#if portraitFile}
      <button class="remove-btn" onclick={clear} title="Portrait-Verknüpfung entfernen">✕</button>
    {/if}
  </div>
  {#if error}<div class="error-sm">{error}</div>{/if}
</div>
