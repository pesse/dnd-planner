<script lang="ts">
  import { llmLoading, llmMessages, llmConfig, loadSavedConfig, saveConfig, deleteApiKey, loadApiKeyForProvider, tokenStats, resetTokenStats } from '../stores/llm';
  import { onMount } from 'svelte';
  import {
    contextScope,
    contextSummary,
    systemPrompt,
    pinnedEntries,
    pinEntry,
    unpinEntry,
    setPinDetailLevel,
  } from '../stores/context';
  import { activeFile, fileContent, appendContent, replaceContent, activeCampaign, invalidateVault } from '../stores/campaign';
  import type { ContextScope } from '../stores/context';
  import {
    ollamaChat,
    ollamaGenerate,
    anthropicChat,
    anthropicGenerate,
    groqChat,
    groqGenerate,
    xaiChat,
    xaiGenerate,
    agentLoop,
  } from '../services/llmService';
  import type { AgentStep, AgentOptions } from '../services/llmService';
  import { debugLog, clearDebugLog } from '../stores/debug';
  import { invoke } from '@tauri-apps/api/core';

  type LlmMode = 'chat' | 'generate' | 'agent' | 'debug';

  let input = $state('');
  let mode = $state<LlmMode>('generate');
  let showPrompt = $state(false);
  let showSettings = $state(false);
  let generateResult = $state('');
  let expandedDebugId = $state<number | null>(null);

  // Agent-Modus State
  let agentSteps = $state<AgentStep[]>([]);
  let agentRunning = $state(false);
  let agentError = $state('');

  // Lokale Kopien für das Settings-Formular
  let settingsProvider = $state($llmConfig.provider);
  let settingsModel = $state($llmConfig.model);
  let settingsBaseUrl = $state($llmConfig.baseUrl ?? 'http://localhost:11434');
  let settingsApiKey = $state($llmConfig.apiKey ?? '');

  const ANTHROPIC_MODELS = [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ];

  const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ];

  const XAI_MODELS = [
    'grok-3',
    'grok-3-mini',
    'grok-2',
  ];

  onMount(() => {
    loadSavedConfig().then(() => {
      // Formular-Felder nach dem Laden synchronisieren
      settingsProvider = $llmConfig.provider;
      settingsModel = $llmConfig.model;
      settingsBaseUrl = $llmConfig.baseUrl ?? 'http://localhost:11434';
      settingsApiKey = $llmConfig.apiKey ?? '';
    });
  });

  async function saveSettings() {
    await saveConfig({
      provider: settingsProvider,
      model: settingsModel,
      baseUrl: settingsProvider === 'ollama' ? settingsBaseUrl : undefined,
      apiKey: settingsProvider !== 'ollama' ? settingsApiKey : undefined,
    });
    showSettings = false;
  }

  async function handleDeleteKey() {
    await deleteApiKey(settingsProvider);
    settingsApiKey = '';
  }

  async function onProviderChange() {
    if (settingsProvider === 'anthropic') {
      settingsModel = 'claude-sonnet-4-6';
    } else if (settingsProvider === 'groq') {
      settingsModel = 'llama-3.3-70b-versatile';
    } else if (settingsProvider === 'xai') {
      settingsModel = 'grok-3';
    } else {
      settingsModel = 'llama3.2';
    }
    // Gespeicherten Key für den neuen Provider laden
    const stored = await loadApiKeyForProvider(settingsProvider);
    settingsApiKey = stored ?? '';
  }

  function buildAgentSystemPrompt(): string {
    const campaign = $activeCampaign;
    const campaignHint = campaign
      ? `\nActive campaign: "${campaign.name}" — vault path: ./vault/campaigns/${campaign.path}/`
      : '';

    return (
      $systemPrompt +
      `\n\n## Vault Agent Mode\n` +
      `You have access to the vault filesystem via three tools:\n` +
      `- **list_files(path)**: Lists .md files in a vault directory\n` +
      `- **read_file(path)**: Reads a vault file\n` +
      `- **write_file(path, content)**: Creates or overwrites a vault file (parent dirs auto-created)\n\n` +
      `Vault structure:\n` +
      `\`\`\`\nvault/campaigns/{slug}/\n  campaign.md\n  acts/*.md\n  sessions/*.md\n  npcs/*.md\n  world/*.md\n\`\`\`` +
      campaignHint +
      `\n\n## Document Templates\n` +
      `Always use these structures when creating or editing files:\n\n` +
      `**Acts** (acts/*.md):\n` +
      `# Act Title\n## Summary\n2-3 sentence overview.\n## Ergebnis\nWhat players accomplished/changed.\n## Details\n### Challenges\n### NPC Motivations\n### Player Choices & Consequences\n\n` +
      `**NPCs** (npcs/*.md):\n` +
      `# NPC Name\n## Summary\nRole + one-liner.\n## Motivations\nWhat they want.\n## Details\n### Personality\n### Secrets\n### Connections\n\n` +
      `**Sessions** (sessions/*.md):\n` +
      `# Session N: Title\n## Summary\nWhat happened.\n## Ergebnis\nWorld changes / player achievements.\n## Details\n### Events\n### Open Threads\n\n` +
      `**World entries** (world/*.md):\n` +
      `# Name\n## Summary\nBrief overview.\n## Details\n### History\n### Current Situation\n\n` +
      `Workflow: read relevant files first to understand current state, then act. ` +
      `Write complete, well-structured markdown. Summarize what you did at the end.`
    );
  }

  async function agentWriteFile(path: string, content: string): Promise<void> {
    const active = $activeFile;
    if (active && path === active.path) {
      // Active file: use replaceContent for full undo support
      replaceContent(content);
    } else {
      // Other files: write directly (not in undo stack)
      await invoke('write_file_content', { path, content });
    }
    // Signal sidebar to reload expanded sections
    invalidateVault();
  }

  async function runAgent() {
    if (!input.trim() || agentRunning) return;
    const task = input.trim();
    input = '';
    agentSteps = [];
    agentError = '';
    agentRunning = true;

    const options: AgentOptions = {
      onStep: (step) => { agentSteps = [...agentSteps, step]; },
      writeFile: agentWriteFile,
    };

    try {
      await agentLoop($llmConfig, task, buildAgentSystemPrompt(), options);
    } catch (e) {
      agentError = e instanceof Error ? e.message : String(e);
    } finally {
      agentRunning = false;
    }
  }

  async function sendMessage() {
    if (!input.trim() || $llmLoading) return;

    const userMsg = input.trim();
    input = '';
    llmLoading.set(true);

    try {
      const config = $llmConfig;

      if (mode === 'chat') {
        // History VOR dem Update snapshot — dann userMsg anhängen
        const history = $llmMessages;
        llmMessages.update((msgs) => [...msgs, { role: 'user', content: userMsg }]);

        const messages = [
          { role: 'system' as const, content: $systemPrompt },
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: userMsg },
        ];

        const response =
          config.provider === 'anthropic' ? await anthropicChat(config, messages)
          : config.provider === 'groq' ? await groqChat(config, messages)
          : config.provider === 'xai' ? await xaiChat(config, messages)
          : await ollamaChat(config, messages);
        llmMessages.update((msgs) => [...msgs, { role: 'assistant', content: response }]);
      } else {
        generateResult = '...';
        const response =
          config.provider === 'anthropic' ? await anthropicGenerate(config, userMsg, $systemPrompt)
          : config.provider === 'groq' ? await groqGenerate(config, userMsg, $systemPrompt)
          : config.provider === 'xai' ? await xaiGenerate(config, userMsg, $systemPrompt)
          : await ollamaGenerate(config, userMsg, $systemPrompt);
        generateResult = response;
      }
    } catch (e) {
      const errMsg = `⚠️ Fehler: ${e instanceof Error ? e.message : JSON.stringify(e)}`;
      if (mode === 'chat') {
        llmMessages.update((msgs) => [...msgs, { role: 'assistant', content: errMsg }]);
      } else {
        generateResult = errMsg;
      }
    } finally {
      llmLoading.set(false);
    }
  }

  function handlePinActive() {
    const file = $activeFile;
    const content = $fileContent;
    if (!file || !content) return;
    pinEntry(file, content);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    llmMessages.set([]);
  }

  function clearGenerate() {
    generateResult = '';
  }

  function fmtTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }
</script>

<div class="llm-panel">
  <!-- Modus-Wechsel + Provider-Anzeige -->
  <div class="mode-bar">
    <button class="mode-btn" class:active={mode === 'chat'} onclick={() => (mode = 'chat')}>
      Chat
    </button>
    <button class="mode-btn" class:active={mode === 'generate'} onclick={() => (mode = 'generate')}>
      Generieren
    </button>
    <button class="mode-btn agent-tab" class:active={mode === 'agent'} onclick={() => (mode = 'agent')}>
      Agent
    </button>
    <button class="mode-btn debug-tab" class:active={mode === 'debug'} onclick={() => (mode = 'debug')}>
      Debug {#if $debugLog.length > 0}<span class="debug-badge">{$debugLog.length}</span>{/if}
    </button>
    <span class="mode-hint">
      {mode === 'chat' ? 'mit History' : mode === 'generate' ? 'einmaliger Output' : mode === 'agent' ? 'Vault-Zugriff' : 'API-Log'}
    </span>
    <button
      class="settings-btn"
      class:active={showSettings}
      onclick={() => (showSettings = !showSettings)}
      title="LLM-Einstellungen"
    >⚙</button>
  </div>

  <!-- Provider-Badge -->
  <div class="provider-badge">
    <span class="badge" class:ollama={$llmConfig.provider === 'ollama'} class:anthropic={$llmConfig.provider === 'anthropic'} class:groq={$llmConfig.provider === 'groq'} class:xai={$llmConfig.provider === 'xai'}>
      {$llmConfig.provider === 'ollama' ? '🦙 Ollama' : $llmConfig.provider === 'groq' ? '⚡ Groq' : $llmConfig.provider === 'xai' ? '✶ xAI' : '✦ Anthropic'}
    </span>
    <span class="model-name">{$llmConfig.model}</span>
    <div class="token-stats">
      <span class="token-item" title="Zuletzt gesendet / empfangen">
        ↑{$tokenStats.last.sent > 0 ? fmtTokens($tokenStats.last.sent) : '–'}
        ↓{$tokenStats.last.received > 0 ? fmtTokens($tokenStats.last.received) : '–'}
      </span>
      {#if $tokenStats.session.sent > 0}
        <span class="token-sep">|</span>
        <span class="token-item token-session" title="Session gesamt">
          Σ ↑{fmtTokens($tokenStats.session.sent)} ↓{fmtTokens($tokenStats.session.received)}
        </span>
        <button class="token-reset" onclick={resetTokenStats} title="Session-Zähler zurücksetzen">↺</button>
      {/if}
    </div>
  </div>

  <!-- Settings-Panel -->
  {#if showSettings}
    <div class="settings-panel">
      <div class="settings-row">
        <label>Provider</label>
        <select bind:value={settingsProvider} onchange={onProviderChange}>
          <option value="ollama">Ollama (lokal)</option>
          <option value="groq">Groq (schnelle Inference)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="xai">xAI (Grok)</option>
        </select>
      </div>

      {#if settingsProvider === 'ollama'}
        <div class="settings-row">
          <label>Modell</label>
          <input type="text" bind:value={settingsModel} placeholder="llama3.2" />
        </div>
        <div class="settings-row">
          <label>URL</label>
          <input type="text" bind:value={settingsBaseUrl} placeholder="http://localhost:11434" />
        </div>
      {:else if settingsProvider === 'groq'}
        <div class="settings-row">
          <label>Modell</label>
          <select bind:value={settingsModel}>
            {#each GROQ_MODELS as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </div>
        <div class="settings-row">
          <label>API-Key</label>
          <input type="password" bind:value={settingsApiKey} placeholder="gsk_..." />
        </div>
      {:else if settingsProvider === 'xai'}
        <div class="settings-row">
          <label>Modell</label>
          <select bind:value={settingsModel}>
            {#each XAI_MODELS as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </div>
        <div class="settings-row">
          <label>API-Key</label>
          <input type="password" bind:value={settingsApiKey} placeholder="xai-..." />
        </div>
      {:else}
        <div class="settings-row">
          <label>Modell</label>
          <select bind:value={settingsModel}>
            {#each ANTHROPIC_MODELS as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </div>
        <div class="settings-row">
          <label>API-Key</label>
          <input type="password" bind:value={settingsApiKey} placeholder="sk-ant-..." />
        </div>
      {/if}

      <div class="settings-footer">
        {#if settingsProvider !== 'ollama' && $llmConfig.apiKey}
          <button class="delete-key-btn" onclick={handleDeleteKey}>Key löschen</button>
        {/if}
        <button class="save-btn" onclick={saveSettings}>Speichern</button>
      </div>
    </div>
  {/if}

  <!-- Context-Bar (nicht im Debug-Modus) -->
  {#if mode !== 'debug' && mode !== 'agent'}
  <div class="context-bar">
    <div class="context-info">
      <span class="context-label">Kontext:</span>
      <span class="context-value" title={$contextSummary}>{$contextSummary}</span>
    </div>
    <div class="context-actions">
      <div class="scope-buttons">
        <button
          class="scope-btn"
          class:active={$contextScope === 'none'}
          onclick={() => contextScope.set('none')}
          title="Aktive Datei nicht einbinden">–</button
        >
        <button
          class="scope-btn"
          class:active={$contextScope === 'file'}
          onclick={() => contextScope.set('file')}
          title="Aktive Datei einbinden">Datei</button
        >
        <button
          class="scope-btn"
          onclick={handlePinActive}
          title="Aktive Datei anpinnen"
          disabled={!$activeFile}>+ Pin</button
        >
      </div>
      <button
        class="icon-btn"
        onclick={() => (showPrompt = !showPrompt)}
        title="System-Prompt anzeigen">{showPrompt ? '▲' : '▼'}</button
      >
    </div>
  </div>

  <!-- Gepinnte Einträge -->
  {#if $pinnedEntries.length > 0}
    <div class="pinned-list">
      {#each $pinnedEntries as pin}
        <div class="pin-row" class:is-char={pin.isCharacter}>
          <span class="pin-icon">{pin.isCharacter ? '⚔' : '📌'}</span>
          <span class="pin-name">{pin.entry.name}</span>

          {#if pin.isCharacter}
            <div class="detail-toggle">
              <button
                class="detail-btn"
                class:active={pin.detailLevel === 'rp'}
                onclick={() => setPinDetailLevel(pin.entry.path, 'rp')}>RP</button
              >
              <button
                class="detail-btn"
                class:active={pin.detailLevel === 'full'}
                onclick={() => setPinDetailLevel(pin.entry.path, 'full')}>Voll</button
              >
            </div>
          {/if}

          <button class="remove-btn" onclick={() => unpinEntry(pin.entry.path)}>×</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- System-Prompt Debug -->
  {#if showPrompt}
    <div class="prompt-preview">
      <pre>{$systemPrompt}</pre>
    </div>
  {/if}

  {/if}<!-- end mode !== debug -->

  <!-- Chat -->
  {#if mode === 'chat'}
    <div class="messages">
      {#each $llmMessages as msg}
        <div class="message {msg.role}">
          <span class="role">{msg.role === 'user' ? 'Du' : 'KI'}</span>
          <p>{msg.content}</p>
          {#if msg.role === 'assistant' && $activeFile}
            <div class="msg-apply-row">
              <button class="msg-apply-btn append" onclick={() => appendContent(msg.content)}>+ Anhängen</button>
              <button class="msg-apply-btn replace" onclick={() => replaceContent(msg.content)}>↺ Ersetzen</button>
            </div>
          {/if}
        </div>
      {/each}

      {#if $llmLoading}
        <div class="message assistant loading">
          <span class="role">KI</span>
          <p>...</p>
        </div>
      {/if}
    </div>

  <!-- Generate -->
  {:else if mode === 'generate'}
    <div class="generate-output">
      {#if generateResult}
        <div class="generate-result">
          <div class="generate-header">
            <span>Ergebnis</span>
            <button class="icon-btn" onclick={clearGenerate}>✕</button>
          </div>
          <p>{generateResult}</p>
          {#if $activeFile}
            <div class="apply-row">
              <button class="apply-btn append" onclick={() => { appendContent(generateResult); clearGenerate(); }}>
                + Anhängen
              </button>
              <button class="apply-btn replace" onclick={() => { replaceContent(generateResult); clearGenerate(); }}>
                ↺ Ersetzen
              </button>
            </div>
          {/if}
        </div>
      {:else if $llmLoading}
        <div class="generate-result loading"><p>Generiere...</p></div>
      {:else}
        <div class="generate-placeholder">
          Prompt eingeben → direkt generierten Content erhalten (kein History-Overhead)
        </div>
      {/if}
    </div>

  <!-- Agent -->
  {:else if mode === 'agent'}
    <div class="agent-output">
      {#if agentSteps.length === 0 && !agentRunning && !agentError}
        <div class="agent-placeholder">
          <p>Beschreibe eine Aufgabe — der Agent liest und schreibt selbstständig Vault-Dateien.</p>
          <p class="agent-hint">Beispiele:<br>
            "Erstelle Akt 3: Die Verräter"<br>
            "Füge NSC Mira die Händlerin hinzu"<br>
            "Passe Akt 2 an — Spieler haben den Turm übersprungen"
          </p>
          {#if $llmConfig.provider === 'ollama'}
            <p class="agent-warning">⚠ Ollama unterstützt kein Tool Calling. Bitte Groq, xAI oder Anthropic wählen.</p>
          {/if}
        </div>
      {:else}
        <div class="agent-log">
          {#each agentSteps as step, i (i)}
            {#if step.type === 'tool_call'}
              <div class="agent-step tool-call">
                <span class="step-icon">{step.tool === 'list_files' ? '📋' : step.tool === 'read_file' ? '📖' : '✏'}</span>
                <span class="step-tool">{step.tool}</span>
                <span class="step-args">
                  {#if step.tool === 'write_file'}
                    <span class="step-path">{(step.args as Record<string,string>)?.path}</span>
                  {:else}
                    <span class="step-path">{Object.values(step.args ?? {}).join(', ')}</span>
                  {/if}
                </span>
              </div>
            {:else if step.type === 'tool_result'}
              <div class="agent-step tool-result">
                <span class="step-icon">↳</span>
                <span class="step-result">{
                  step.result && step.result.length > 120
                    ? step.result.slice(0, 120) + '…'
                    : step.result
                }</span>
              </div>
            {:else if step.type === 'done'}
              <div class="agent-step done">
                <span class="step-icon">✓</span>
                <span class="step-done-text">{step.text}</span>
              </div>
            {/if}
          {/each}

          {#if agentRunning}
            <div class="agent-step running">
              <span class="step-icon spin">⟳</span>
              <span>Agent arbeitet…</span>
            </div>
          {/if}

          {#if agentError}
            <div class="agent-step agent-err">
              <span class="step-icon">⚠</span>
              <span>{agentError}</span>
            </div>
          {/if}
        </div>

        {#if !agentRunning && (agentSteps.length > 0 || agentError)}
          <button class="agent-clear-btn" onclick={() => { agentSteps = []; agentError = ''; }}>
            Neuer Auftrag
          </button>
        {/if}
      {/if}
    </div>

  <!-- Debug -->
  {:else if mode === 'debug'}
    <div class="debug-output">
      <div class="debug-toolbar">
        <span class="debug-count">{$debugLog.length} Einträge</span>
        <button class="icon-btn" onclick={clearDebugLog} title="Log leeren">✕ Leeren</button>
      </div>
      {#if $debugLog.length === 0}
        <div class="debug-empty">Noch keine API-Calls — Chat oder Generieren nutzen.</div>
      {:else}
        {#each [...$debugLog].reverse() as entry (entry.id)}
          <div
            class="debug-entry"
            class:req={entry.type === 'request'}
            class:res={entry.type === 'response'}
            class:err={entry.type === 'error'}
          >
            <button
              class="debug-entry-header"
              onclick={() => (expandedDebugId = expandedDebugId === entry.id ? null : entry.id)}
            >
              <span class="debug-type {entry.type}">{entry.type}</span>
              <span class="debug-provider-label">{entry.provider}</span>
              <span class="debug-label-text">{entry.label}</span>
              <span class="debug-meta">
                {#if entry.durationMs !== undefined}{entry.durationMs}ms · {/if}{entry.timestamp.toLocaleTimeString()}
              </span>
              <span class="debug-chevron">{expandedDebugId === entry.id ? '▲' : '▼'}</span>
            </button>
            {#if expandedDebugId === entry.id}
              <pre class="debug-data">{JSON.stringify(entry.data, null, 2)}</pre>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Input (nicht im Debug-Modus) -->
  {#if mode !== 'debug'}
  <div class="input-row">
    <textarea
      bind:value={input}
      onkeydown={mode !== 'agent' ? handleKeydown : undefined}
      placeholder={mode === 'chat'
        ? 'Frage an die KI (Enter = senden)'
        : mode === 'agent'
        ? 'Aufgabe beschreiben (der Agent erledigt sie selbstständig)'
        : 'Was soll generiert werden?'}
      rows="3"
      disabled={agentRunning}
    ></textarea>
    <div class="input-buttons">
      {#if mode === 'chat'}
        <button class="clear-btn" onclick={clearChat} disabled={$llmLoading}>Leeren</button>
      {/if}
      {#if mode === 'agent'}
        <button onclick={runAgent} disabled={agentRunning || !input.trim()} class="agent-run-btn">
          {agentRunning ? 'Läuft…' : 'Starten'}
        </button>
      {:else}
        <button onclick={sendMessage} disabled={$llmLoading}>
          {mode === 'chat' ? 'Senden' : 'Generieren'}
        </button>
      {/if}
    </div>
  </div>
  {/if}<!-- end mode !== debug -->
</div>

<style>
  .llm-panel {
    width: 100%;
    display: flex;
    flex-direction: column;
    background: #181825;
    border-left: 1px solid #313244;
    flex-shrink: 0;
    min-height: 0;
  }

  /* Mode bar */
  .mode-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid #313244;
    background: #11111b;
    position: relative;
    flex-shrink: 0;
  }

  .mode-btn {
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
  }

  .mode-btn.active {
    background: #89b4fa;
    color: #1e1e2e;
    border-color: #89b4fa;
  }

  .settings-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid #45475a;
    border-radius: 4px;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.15rem 0.4rem;
  }

  .settings-btn.active {
    color: #f9e2af;
    border-color: #f9e2af;
  }

  /* Provider badge */
  .provider-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: #11111b;
    border-bottom: 1px solid #313244;
    flex-shrink: 0;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
  }

  .badge.ollama    { background: #2a3a2a; color: #a6e3a1; }
  .badge.anthropic { background: #2a2a3a; color: #cba6f7; }
  .badge.groq      { background: #3a2a1a; color: #fab387; }
  .badge.xai       { background: #1a2a3a; color: #89dceb; }

  .model-name {
    font-size: 0.68rem;
    color: #45475a;
  }

  .token-stats {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .token-item {
    font-size: 0.65rem;
    color: #45475a;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .token-session { color: #585b70; }
  .token-sep { font-size: 0.6rem; color: #313244; }

  .token-reset {
    background: transparent;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
    line-height: 1;
    border-radius: 0;
  }

  .token-reset:hover { color: #6c7086; }

  /* Settings panel */
  .settings-panel {
    background: #11111b;
    border-bottom: 1px solid #313244;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  .settings-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .settings-row label {
    font-size: 0.7rem;
    color: #6c7086;
    width: 52px;
    flex-shrink: 0;
  }

  .settings-row input,
  .settings-row select {
    flex: 1;
    background: #1e1e2e;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
    font-family: inherit;
    outline: none;
    min-width: 0;
  }

  .settings-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.1rem;
  }

  .save-btn {
    background: #a6e3a1;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.8rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }

  .delete-key-btn {
    background: transparent;
    color: #f38ba8;
    border: 1px solid #f38ba8;
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .mode-hint {
    font-size: 0.65rem;
    color: #45475a;
    margin-left: 0.25rem;
  }

  /* Context bar */
  .context-bar {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #313244;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: #1e1e2e;
    flex-shrink: 0;
  }

  .context-info {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
    min-width: 0;
  }

  .context-label {
    font-size: 0.7rem;
    color: #6c7086;
    font-weight: 600;
    flex-shrink: 0;
  }

  .context-value {
    font-size: 0.72rem;
    color: #a6e3a1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .context-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: space-between;
  }

  .scope-buttons {
    display: flex;
    gap: 0.25rem;
  }

  .scope-btn {
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .scope-btn.active {
    background: #cba6f7;
    color: #1e1e2e;
    border-color: #cba6f7;
  }

  .scope-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.15rem 0.3rem;
  }

  /* Pinned list */
  .pinned-list {
    border-bottom: 1px solid #313244;
    background: #1e1e2e;
    flex-shrink: 0;
  }

  .pin-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid #252535;
    font-size: 0.72rem;
  }

  .pin-row:last-child { border-bottom: none; }

  .pin-icon { flex-shrink: 0; font-size: 0.7rem; }

  .pin-name {
    flex: 1;
    color: #cdd6f4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pin-row.is-char .pin-name { color: #f38ba8; }

  .detail-toggle {
    display: flex;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .detail-btn {
    background: #313244;
    color: #6c7086;
    border: 1px solid #45475a;
    border-radius: 3px;
    padding: 0.1rem 0.3rem;
    font-size: 0.65rem;
    cursor: pointer;
    font-weight: 600;
  }

  .detail-btn.active {
    background: #f38ba8;
    color: #1e1e2e;
    border-color: #f38ba8;
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
  }

  .remove-btn:hover { color: #f38ba8; }

  /* Prompt preview */
  .prompt-preview {
    background: #11111b;
    border-bottom: 1px solid #313244;
    padding: 0.5rem 0.75rem;
    max-height: 150px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .prompt-preview pre {
    margin: 0;
    font-size: 0.65rem;
    color: #6c7086;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Messages */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .message {
    background: #1e1e2e;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .message.user { background: #313244; }

  .role {
    font-size: 0.75rem;
    color: #6c7086;
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
  }

  .message p, .generate-result p {
    margin: 0;
    font-size: 0.9rem;
    color: #cdd6f4;
    white-space: pre-wrap;
  }

  .loading p { color: #6c7086; }

  .msg-apply-row {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px solid #313244;
  }

  .msg-apply-btn {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }

  .msg-apply-btn.append  { background: #a6e3a1; color: #1e1e2e; }
  .msg-apply-btn.replace { background: #f9e2af; color: #1e1e2e; }

  /* Generate */
  .generate-output {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    min-height: 0;
  }

  .generate-placeholder {
    font-size: 0.78rem;
    color: #45475a;
    text-align: center;
    padding: 2rem 1rem;
    line-height: 1.5;
  }

  .generate-result {
    background: #1e1e2e;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .generate-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.72rem;
    color: #89b4fa;
    font-weight: 600;
  }

  .apply-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.6rem;
    padding-top: 0.5rem;
    border-top: 1px solid #313244;
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

  .apply-btn.append  { background: #a6e3a1; color: #1e1e2e; }
  .apply-btn.replace { background: #f9e2af; color: #1e1e2e; }

  /* Input */
  .input-row {
    padding: 0.75rem;
    border-top: 1px solid #313244;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  textarea {
    background: #1e1e2e;
    border: 1px solid #313244;
    border-radius: 6px;
    color: #cdd6f4;
    padding: 0.5rem;
    font-size: 0.9rem;
    resize: none;
    outline: none;
    font-family: inherit;
  }

  .input-buttons {
    display: flex;
    gap: 0.5rem;
  }

  button {
    background: #cba6f7;
    color: #1e1e2e;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .clear-btn {
    background: #313244;
    color: #cdd6f4;
    flex: 0 0 auto;
  }

  .input-buttons button:last-child { flex: 1; }

  /* Agent-Tab Button */
  .mode-btn.agent-tab.active {
    background: #a6e3a1;
    color: #1e1e2e;
    border-color: #a6e3a1;
  }

  /* Agent Output */
  .agent-output {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .agent-placeholder {
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .agent-placeholder p {
    margin: 0;
    font-size: 0.8rem;
    color: #6c7086;
    line-height: 1.5;
  }

  .agent-hint {
    font-size: 0.72rem !important;
    color: #45475a !important;
    font-style: italic;
    background: #11111b;
    border-radius: 6px;
    padding: 0.5rem 0.75rem !important;
    line-height: 1.8 !important;
  }

  .agent-warning {
    font-size: 0.75rem !important;
    color: #f9e2af !important;
    background: #2a2a1a;
    border-radius: 4px;
    padding: 0.4rem 0.6rem !important;
  }

  .agent-log {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .agent-step {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.3rem 0.75rem;
    font-size: 0.75rem;
    border-bottom: 1px solid #1e1e2e;
  }

  .step-icon {
    flex-shrink: 0;
    font-size: 0.8rem;
    width: 1.1rem;
    text-align: center;
  }

  .agent-step.tool-call { background: #181825; }
  .agent-step.tool-result { background: #11111b; padding-left: 2.1rem; }
  .agent-step.done { background: #1a2a1a; border-top: 1px solid #2a4a2a; margin-top: 0.25rem; align-items: flex-start; }
  .agent-step.running { color: #6c7086; font-style: italic; }
  .agent-step.agent-err { color: #f38ba8; background: #2a1a1a; }

  .step-tool {
    color: #89b4fa;
    font-weight: 600;
    flex-shrink: 0;
  }

  .step-path {
    color: #a6adc8;
    font-size: 0.7rem;
    font-family: monospace;
    word-break: break-all;
  }

  .step-result {
    color: #585b70;
    font-size: 0.7rem;
    font-style: italic;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .step-done-text {
    color: #a6e3a1;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .agent-clear-btn {
    margin: 0.75rem;
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
    cursor: pointer;
    flex-shrink: 0;
    align-self: flex-start;
  }

  .agent-run-btn {
    flex: 1;
    background: #a6e3a1;
    color: #1e1e2e;
  }

  .agent-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; }

  /* Debug-Tab Button */
  .debug-tab { position: relative; }

  .debug-badge {
    display: inline-block;
    background: #f38ba8;
    color: #1e1e2e;
    border-radius: 8px;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0 0.3rem;
    margin-left: 0.2rem;
    vertical-align: middle;
    line-height: 1.4;
  }

  .mode-btn.debug-tab.active {
    background: #f38ba8;
    color: #1e1e2e;
    border-color: #f38ba8;
  }

  /* Debug Output */
  .debug-output {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .debug-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid #313244;
    background: #11111b;
    flex-shrink: 0;
  }

  .debug-count {
    font-size: 0.7rem;
    color: #6c7086;
    font-weight: 600;
  }

  .debug-empty {
    padding: 2rem 1rem;
    text-align: center;
    font-size: 0.78rem;
    color: #45475a;
    line-height: 1.5;
  }

  .debug-entry {
    border-bottom: 1px solid #252535;
  }

  .debug-entry-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 0;
    color: #cdd6f4;
    cursor: pointer;
    text-align: left;
    font-size: 0.72rem;
    font-family: inherit;
  }

  .debug-entry-header:hover { background: #1e1e2e; }

  .debug-type {
    font-size: 0.62rem;
    font-weight: 700;
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .debug-type.request  { background: #2a3a2a; color: #a6e3a1; }
  .debug-type.response { background: #2a2a3a; color: #89b4fa; }
  .debug-type.error    { background: #3a1a1a; color: #f38ba8; }

  .debug-provider-label {
    font-size: 0.68rem;
    color: #89b4fa;
    font-weight: 600;
    flex-shrink: 0;
  }

  .debug-label-text {
    flex: 1;
    color: #cdd6f4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .debug-meta {
    font-size: 0.65rem;
    color: #45475a;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .debug-chevron {
    font-size: 0.6rem;
    color: #45475a;
    flex-shrink: 0;
  }

  .debug-data {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.68rem;
    color: #a6adc8;
    background: #11111b;
    white-space: pre-wrap;
    word-break: break-all;
    border-top: 1px solid #252535;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }
</style>
