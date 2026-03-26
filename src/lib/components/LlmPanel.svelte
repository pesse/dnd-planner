<script lang="ts">
  import { llmLoading, llmMessages, llmConfig, loadSavedConfig, saveConfig, deleteApiKey, loadApiKeyForProvider } from '../stores/llm';
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
  import { activeFile, fileContent, appendContent, replaceContent } from '../stores/campaign';
  import type { ContextScope } from '../stores/context';
  import {
    ollamaChat,
    ollamaGenerate,
    anthropicChat,
    anthropicGenerate,
    groqChat,
    groqGenerate,
  } from '../services/llmService';

  type LlmMode = 'chat' | 'generate';

  let input = $state('');
  let mode = $state<LlmMode>('generate');
  let showPrompt = $state(false);
  let showSettings = $state(false);
  let generateResult = $state('');

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
    } else {
      settingsModel = 'llama3.2';
    }
    // Gespeicherten Key für den neuen Provider laden
    const stored = await loadApiKeyForProvider(settingsProvider);
    settingsApiKey = stored ?? '';
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
          : await ollamaChat(config, messages);
        llmMessages.update((msgs) => [...msgs, { role: 'assistant', content: response }]);
      } else {
        generateResult = '...';
        const response =
          config.provider === 'anthropic' ? await anthropicGenerate(config, userMsg, $systemPrompt)
          : config.provider === 'groq' ? await groqGenerate(config, userMsg, $systemPrompt)
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
    <span class="mode-hint">
      {mode === 'chat' ? 'mit History' : 'einmaliger Output'}
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
    <span class="badge" class:ollama={$llmConfig.provider === 'ollama'} class:anthropic={$llmConfig.provider === 'anthropic'} class:groq={$llmConfig.provider === 'groq'}>
      {$llmConfig.provider === 'ollama' ? '🦙 Ollama' : $llmConfig.provider === 'groq' ? '⚡ Groq' : '✦ Anthropic'}
    </span>
    <span class="model-name">{$llmConfig.model}</span>
  </div>

  <!-- Settings-Panel -->
  {#if showSettings}
    <div class="settings-panel">
      <div class="settings-row">
        <label>Provider</label>
        <select bind:value={settingsProvider} onchange={onProviderChange}>
          <option value="ollama">Ollama (lokal)</option>
          <option value="groq">Groq (kostenlos)</option>
          <option value="anthropic">Anthropic (Claude)</option>
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

  <!-- Context-Bar -->
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
  {:else}
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
  {/if}

  <!-- Input -->
  <div class="input-row">
    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder={mode === 'chat'
        ? 'Frage an die KI (Enter = senden)'
        : 'Was soll generiert werden?'}
      rows="3"
    ></textarea>
    <div class="input-buttons">
      {#if mode === 'chat'}
        <button class="clear-btn" onclick={clearChat} disabled={$llmLoading}>Leeren</button>
      {/if}
      <button onclick={sendMessage} disabled={$llmLoading}>
        {mode === 'chat' ? 'Senden' : 'Generieren'}
      </button>
    </div>
  </div>
</div>

<style>
  .llm-panel {
    width: 320px;
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

  .model-name {
    font-size: 0.68rem;
    color: #45475a;
  }

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
</style>
