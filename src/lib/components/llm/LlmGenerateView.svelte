<script lang="ts">
  /** Einmaliger Generieren-Lauf: Ergebnisanzeige, Übernahme in Datei, JSON-Fundstücke. */
  import { llmLoading } from '../../stores/llm';
  import { activeFile, activeCampaign, appendContent } from '../../stores/campaign';
  import {
    extractJsonBlocks,
    replaceWithResponse,
    saveJsonBlock,
    suggestNewFilePath,
    writeNewFile,
  } from '../../services/responseArtifacts';
  import ResponseBlocks from './ResponseBlocks.svelte';
  import NewFileRow from './NewFileRow.svelte';

  let {
    result,
    onclear,
    onprompt,
  }: {
    result: string;
    onclear: () => void;
    /** Vorlagen-Knopf schreibt einen fertigen Auftrag ins Eingabefeld. */
    onprompt: (text: string) => void;
  } = $props();

  let copied = $state(false);
  let showNewFile = $state(false);
  let newFilePath = $state('');
  let newFileSaveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let saveStatus = $state<Record<number, 'saving' | 'saved' | 'error'>>({});

  let detectedBlocks = $derived(result ? extractJsonBlocks(result) : []);

  function clear() {
    showNewFile = false;
    newFileSaveStatus = 'idle';
    onclear();
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => { copied = false; }, 1500);
  }

  function toggleNewFile() {
    showNewFile = !showNewFile;
    if (showNewFile) {
      newFilePath = suggestNewFilePath($activeFile, $activeCampaign);
      newFileSaveStatus = 'idle';
    }
  }

  async function saveAsNewFile(content: string): Promise<void> {
    if (!newFilePath.trim()) return;
    newFileSaveStatus = 'saving';
    try {
      await writeNewFile(newFilePath.trim(), content);
      newFileSaveStatus = 'saved';
    } catch {
      newFileSaveStatus = 'error';
    }
  }

  async function saveBlock(index: number): Promise<void> {
    const campaign = $activeCampaign;
    if (!campaign) return;
    saveStatus = { ...saveStatus, [index]: 'saving' };
    try {
      await saveJsonBlock(detectedBlocks[index], campaign);
      saveStatus = { ...saveStatus, [index]: 'saved' };
    } catch {
      saveStatus = { ...saveStatus, [index]: 'error' };
    }
  }
</script>

<div class="generate-output">
  {#if result}
    <div class="generate-result">
      <div class="generate-header">
        <span>Ergebnis</span>
        <div class="header-actions">
          <button class="icon-btn" onclick={() => copyText(result)} title="In Zwischenablage kopieren">
            {copied ? '✓' : '⎘'}
          </button>
          <button class="icon-btn" onclick={clear}>✕</button>
        </div>
      </div>
      <ResponseBlocks text={result} />
      <div class="apply-row">
        <button class="apply-btn append" disabled={!$activeFile} onclick={() => { appendContent(result); clear(); }}>
          + Anhängen
        </button>
        <button class="apply-btn replace" disabled={!$activeFile} onclick={() => { replaceWithResponse(result, $activeFile); clear(); }}>
          ↺ Ersetzen
        </button>
        <button class="apply-btn new-file" onclick={toggleNewFile}>
          + Datei
        </button>
      </div>
      {#if showNewFile}
        <NewFileRow bind:path={newFilePath} status={newFileSaveStatus} onsave={() => saveAsNewFile(result)} />
      {/if}
      {#if detectedBlocks.length > 0}
        <div class="json-save-row">
          {#each detectedBlocks as block, i}
            <button
              class="json-save-btn"
              class:saved={saveStatus[i] === 'saved'}
              class:error={saveStatus[i] === 'error'}
              disabled={saveStatus[i] === 'saving' || saveStatus[i] === 'saved'}
              onclick={() => saveBlock(i)}
            >
              {#if saveStatus[i] === 'saving'}…
              {:else if saveStatus[i] === 'saved'}✓ Gespeichert
              {:else if saveStatus[i] === 'error'}✕ Fehler
              {:else}{block.type === 'monster' ? '🐉 Monster speichern' : '⚔ Encounter speichern'}: {block.data.name as string}
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if $llmLoading}
    <div class="generate-result loading"><p>Generiere...</p></div>
  {:else}
    <div class="generate-placeholder">
      <span>Prompt eingeben → direkt generierten Content erhalten (kein History-Overhead)</span>
      {#if $activeCampaign}
        <div class="template-buttons">
          <button class="template-btn" onclick={() => onprompt(`Erstelle einen Encounter für 2 Spieler auf Level 6 mit Schwierigkeit schwer. Gib das JSON im Encounter-Format aus.`)}>
            ⚔ Encounter
          </button>
          <button class="template-btn" onclick={() => onprompt(`Erstelle ein Monster: Goblin-Anführer, HG 2. Gib das JSON im Monster-Format aus.`)}>
            🐉 Monster
          </button>
          <button class="template-btn" onclick={() => onprompt(`Erstelle einen Boss-Gegner, HG 8, passend zur aktiven Kampagne. Gib das JSON im Monster-Format aus.`)}>
            💀 Boss
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .generate-output {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    min-height: 0;
  }

  .generate-placeholder {
    font-size: 0.78rem;
    color: var(--border);
    text-align: center;
    padding: 2rem 1rem;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .generate-result {
    background: var(--bg);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .generate-result p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink);
    white-space: pre-wrap;
  }

  .loading p { color: var(--ink-muted); }

  .generate-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.72rem;
    color: var(--red);
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 0.1rem;
    align-items: center;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.3rem;
  }

  .apply-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.6rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--surface);
  }

  .apply-btn {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }

  .apply-btn.append  { background: var(--green); color: var(--bg); }
  .apply-btn.replace { background: var(--gold); color: var(--bg); }
  .apply-btn.new-file { background: var(--red); color: var(--bg); }
  .apply-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .json-save-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.6rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--surface);
  }

  .json-save-btn {
    border: 1px solid var(--arcane);
    background: transparent;
    color: var(--arcane);
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .json-save-btn:hover:not(:disabled) { background: var(--surface); }
  .json-save-btn.saved { border-color: var(--green); color: var(--green); cursor: default; }
  .json-save-btn.error { border-color: var(--danger); color: var(--danger); }
  .json-save-btn:disabled { opacity: 0.7; cursor: default; }

  .template-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
  }

  .template-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink);
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .template-btn:hover { background: var(--border); }
</style>
