<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import Modal from './ui/Modal.svelte';
  import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
  import { invalidateVault } from '../stores/campaign';

  let { onclose }: { onclose: () => void } = $props();

  interface VaultContents {
    campaigns: string[];
    characters: string[];
    items: boolean;
    monsters: boolean;
    spells: boolean;
    classes: boolean;
    species: boolean;
    feats: boolean;
    backgrounds: boolean;
  }

  /** Bibliotheks-Kategorien (bool-Flags), Reihenfolge = Anzeige im Dialog. */
  const LIBS = [
    { key: 'items', label: 'Gegenstände' },
    { key: 'monsters', label: 'Monster' },
    { key: 'spells', label: 'Zauber' },
    { key: 'classes', label: 'Klassen' },
    { key: 'species', label: 'Spezies' },
    { key: 'feats', label: 'Talente' },
    { key: 'backgrounds', label: 'Hintergründe' },
  ] as const;
  type LibKey = (typeof LIBS)[number]['key'];

  type Tab = 'export' | 'import';
  let tab = $state<Tab>('export');

  /** slug → mit Unterstrichen lesbarer machen */
  const pretty = (slug: string) => slug.replace(/[_-]+/g, ' ');

  function buildSelection(
    camps: Record<string, boolean>,
    chars: Record<string, boolean>,
    libs: Record<LibKey, boolean>,
  ) {
    return {
      campaigns: Object.keys(camps).filter((k) => camps[k]),
      characters: Object.keys(chars).filter((k) => chars[k]),
      ...libs,
    };
  }

  function countSelected(sel: ReturnType<typeof buildSelection>): number {
    return (
      sel.campaigns.length +
      sel.characters.length +
      LIBS.filter((l) => sel[l.key]).length
    );
  }

  function initMap(keys: string[], value: boolean): Record<string, boolean> {
    return Object.fromEntries(keys.map((k) => [k, value]));
  }

  /** Bibliotheks-Flags aus einer Übersicht/Manifest in ein Record übernehmen. */
  function libsFrom(c: VaultContents): Record<LibKey, boolean> {
    return Object.fromEntries(LIBS.map((l) => [l.key, c[l.key]])) as Record<LibKey, boolean>;
  }

  // ── Export ──────────────────────────────────────────────────────────────
  let overview = $state<VaultContents | null>(null);
  let expCampaigns = $state<Record<string, boolean>>({});
  let expCharacters = $state<Record<string, boolean>>({});
  let expLibs = $state<Record<LibKey, boolean>>({} as Record<LibKey, boolean>);
  let exporting = $state(false);
  let exportResult = $state('');
  let exportError = $state('');

  let exportSelection = $derived(buildSelection(expCampaigns, expCharacters, expLibs));

  onMount(async () => {
    try {
      overview = await invoke<VaultContents>('get_vault_overview');
      expCampaigns = initMap(overview.campaigns, true);
      expCharacters = initMap(overview.characters, true);
      expLibs = libsFrom(overview);
    } catch (e) {
      exportError = `Vault konnte nicht gelesen werden: ${e}`;
    }
  });

  async function doExport() {
    exportResult = '';
    exportError = '';
    const selection = exportSelection;
    if (countSelected(selection) === 0) return;

    let dest: string | null;
    try {
      dest = await saveFileDialog({
        defaultPath: 'vault-export.zip',
        filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
      });
    } catch (e) {
      exportError = `Speicherort-Auswahl fehlgeschlagen: ${e}`;
      return;
    }
    if (!dest) return;

    exporting = true;
    try {
      const res = await invoke<{ files: number; bytes: number }>('export_vault', {
        selection,
        destPath: dest,
      });
      const kb = Math.max(1, Math.round(res.bytes / 1024));
      exportResult = `${res.files} Datei(en) exportiert (${kb} KB).`;
    } catch (e) {
      exportError = `Export fehlgeschlagen: ${e}`;
    } finally {
      exporting = false;
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────
  let zipPath = $state<string | null>(null);
  let manifest = $state<VaultContents | null>(null);
  let impCampaigns = $state<Record<string, boolean>>({});
  let impCharacters = $state<Record<string, boolean>>({});
  let impLibs = $state<Record<LibKey, boolean>>({} as Record<LibKey, boolean>);
  let overwrite = $state(true);
  let importing = $state(false);
  let importResult = $state('');
  let importError = $state('');

  let importSelection = $derived(buildSelection(impCampaigns, impCharacters, impLibs));

  async function pickZip() {
    importResult = '';
    importError = '';
    let selected: string | null;
    try {
      const picked = await openFileDialog({
        multiple: false,
        filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
      });
      selected = (picked as string) ?? null;
    } catch (e) {
      importError = `Dateiauswahl fehlgeschlagen: ${e}`;
      return;
    }
    if (!selected) return;
    zipPath = selected;

    try {
      manifest = await invoke<VaultContents>('inspect_import_zip', { zipPath: selected });
      impCampaigns = initMap(manifest.campaigns, true);
      impCharacters = initMap(manifest.characters, true);
      impLibs = libsFrom(manifest);
    } catch (e) {
      manifest = null;
      importError = `ZIP konnte nicht gelesen werden: ${e}`;
    }
  }

  async function doImport() {
    importResult = '';
    importError = '';
    if (!zipPath) return;
    const selection = importSelection;
    if (countSelected(selection) === 0) return;

    importing = true;
    try {
      const res = await invoke<{ written: number; skipped: number }>('import_vault', {
        zipPath,
        selection,
        overwrite,
      });
      const skipped = res.skipped > 0 ? `, ${res.skipped} übersprungen` : '';
      importResult = `${res.written} Datei(en) importiert${skipped}.`;
      invalidateVault();
    } catch (e) {
      importError = `Import fehlgeschlagen: ${e}`;
    } finally {
      importing = false;
    }
  }
</script>

<Modal title="Vault Import / Export" draggable={false} width="min(520px, 92vw)" {onclose}>
  <div class="tabs">
    <button class="tab" class:active={tab === 'export'} onclick={() => (tab = 'export')}>Export</button>
    <button class="tab" class:active={tab === 'import'} onclick={() => (tab = 'import')}>Import</button>
  </div>

  {#if tab === 'export'}
    {#if !overview}
      <p class="hint">Lade Vault-Inhalt…</p>
    {:else}
      <p class="hint">Wähle, was in das ZIP-Archiv exportiert werden soll.</p>

      {#if overview.campaigns.length}
        <fieldset class="group">
          <legend>Kampagnen</legend>
          {#each overview.campaigns as slug}
            <label class="check">
              <input type="checkbox" bind:checked={expCampaigns[slug]} />
              <span>{pretty(slug)}</span>
            </label>
          {/each}
        </fieldset>
      {/if}

      {#if overview.characters.length}
        <fieldset class="group">
          <legend>Charaktere</legend>
          {#each overview.characters as slug}
            <label class="check">
              <input type="checkbox" bind:checked={expCharacters[slug]} />
              <span>{pretty(slug)}</span>
            </label>
          {/each}
        </fieldset>
      {/if}

      <fieldset class="group">
        <legend>Bibliotheken</legend>
        {#each LIBS as lib}
          <label class="check" class:disabled={!overview[lib.key]}>
            <input type="checkbox" bind:checked={expLibs[lib.key]} disabled={!overview[lib.key]} />
            <span>{lib.label}</span>
          </label>
        {/each}
      </fieldset>

      <div class="actions">
        <button
          class="primary-btn"
          onclick={doExport}
          disabled={exporting || countSelected(exportSelection) === 0}
        >
          {exporting ? 'Exportiere…' : 'Als ZIP exportieren'}
        </button>
      </div>

      {#if exportResult}<p class="hint ok">{exportResult}</p>{/if}
      {#if exportError}<p class="hint err">{exportError}</p>{/if}
    {/if}

  {:else}
    <p class="hint">Wähle ein Export-ZIP und entscheide, was importiert wird.</p>

    <div class="actions left">
      <button class="secondary-btn" onclick={pickZip}>ZIP auswählen…</button>
      {#if zipPath}<span class="path" title={zipPath}>{zipPath.split(/[/\\]/).pop()}</span>{/if}
    </div>

    {#if manifest}
      {#if manifest.campaigns.length}
        <fieldset class="group">
          <legend>Kampagnen</legend>
          {#each manifest.campaigns as slug}
            <label class="check">
              <input type="checkbox" bind:checked={impCampaigns[slug]} />
              <span>{pretty(slug)}</span>
            </label>
          {/each}
        </fieldset>
      {/if}

      {#if manifest.characters.length}
        <fieldset class="group">
          <legend>Charaktere</legend>
          {#each manifest.characters as slug}
            <label class="check">
              <input type="checkbox" bind:checked={impCharacters[slug]} />
              <span>{pretty(slug)}</span>
            </label>
          {/each}
        </fieldset>
      {/if}

      {#if LIBS.some((l) => manifest![l.key])}
        <fieldset class="group">
          <legend>Bibliotheken</legend>
          {#each LIBS as lib}
            {#if manifest[lib.key]}
              <label class="check">
                <input type="checkbox" bind:checked={impLibs[lib.key]} /><span>{lib.label}</span>
              </label>
            {/if}
          {/each}
        </fieldset>
      {/if}

      <label class="check overwrite">
        <input type="checkbox" bind:checked={overwrite} />
        <span>Vorhandene Dateien überschreiben</span>
      </label>

      <div class="actions">
        <button
          class="primary-btn"
          onclick={doImport}
          disabled={importing || countSelected(importSelection) === 0}
        >
          {importing ? 'Importiere…' : 'Importieren'}
        </button>
      </div>
    {/if}

    {#if importResult}<p class="hint ok">{importResult}</p>{/if}
    {#if importError}<p class="hint err">{importError}</p>{/if}
  {/if}
</Modal>

<style>
  .tabs { display: flex; gap: 0.3rem; border-bottom: 1px solid var(--surface); }
  .tab {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--ink-muted); padding: 0.35rem 0.7rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }
  .tab.active { color: var(--ink); border-bottom-color: var(--red); }

  .group {
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.4rem 0.7rem 0.6rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .group legend {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--ink-muted); padding: 0 0.3rem;
  }
  .check {
    display: flex; align-items: center; gap: 0.45rem;
    font-size: 0.85rem; color: var(--ink-soft); cursor: pointer;
  }
  .check span { text-transform: capitalize; }
  .check.disabled { opacity: 0.4; cursor: not-allowed; }
  .check.overwrite { margin-top: 0.2rem; }
  .check.overwrite span { text-transform: none; }
  .check input { accent-color: var(--red); cursor: pointer; }

  .path { font-size: 0.78rem; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; align-items: center; }
  .actions.left { justify-content: flex-start; }

  .hint { font-size: 0.78rem; margin: 0; color: var(--ink-muted); }
  .hint.ok { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }
</style>
