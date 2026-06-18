<script lang="ts">
  import { llmLoading, llmMessages, llmConfig, loadSavedConfig, saveConfig, deleteApiKey, loadApiKeyForProvider, tokenStats, resetTokenStats } from '../stores/llm';
  import { onMount } from 'svelte';
  import {
    contextFlags,
    systemPrompt,
    pinnedEntries,
    actSummaries,
    encounterSummaries,
    monsterLibrary,
    encounterMonsterDefs,
    campaignContent,
    campaignCharacterData,
    pinEntry,
    unpinEntry,
    setPinDetailLevel,
    loadEncounterContext,
    loadEncounterMonsters,
  } from '../stores/context';
  import type { ContextFlags } from '../stores/context';
  import { monsterTypeLabel } from '../types';
  import { activeFile, fileContent, appendContent, replaceContent, activeCampaign, invalidateVault } from '../stores/campaign';
  import { modelSupportsTemperature } from '../services/llmService';
  import { getClient } from '../services/llmClient';
  import type { AgentStep, AgentOptions } from '../services/llmService';
  import { debugLog, clearDebugLog } from '../stores/debug';
  import { invoke } from '@tauri-apps/api/core';
  import { marked } from 'marked';

  type LlmMode = 'chat' | 'generate' | 'agent' | 'debug';

  let input = $state('');
  const VALID_MODES: LlmMode[] = ['chat', 'generate', 'agent', 'debug'];
  const savedMode = localStorage.getItem('llm-mode') as LlmMode | null;
  let mode = $state<LlmMode>(savedMode && VALID_MODES.includes(savedMode) ? savedMode : 'generate');

  $effect(() => { localStorage.setItem('llm-mode', mode); });

  // Aktueller LLM-Client (Provider-Adapter + Capabilities) — reaktiv zur Config.
  let client = $derived(getClient($llmConfig));

  let showPrompt = $state(false);
  let showSettings = $state(false);
  let generateResult = $state('');
  let expandedDebugId = $state<number | null>(null);

  // Agent-Modus State
  let agentSteps = $state<AgentStep[]>([]);
  let agentRunning = $state(false);
  let agentError = $state('');
  let agentAbortController = $state<AbortController | null>(null);

  // Lokale Kopien für das Settings-Formular
  let settingsProvider = $state($llmConfig.provider);
  let settingsModel = $state($llmConfig.model);
  let settingsBaseUrl = $state($llmConfig.baseUrl ?? 'http://localhost:11434');
  let settingsApiKey = $state($llmConfig.apiKey ?? '');
  let settingsMaxTokens = $state($llmConfig.maxTokens ?? 4096);
  // Temperature: optionaler globaler Override. Aus → Task-Presets je Kontext greifen.
  let settingsTempOverride = $state($llmConfig.temperature != null);
  let settingsTemperature = $state($llmConfig.temperature ?? 0.7);

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
      settingsMaxTokens = $llmConfig.maxTokens ?? 4096;
      settingsTempOverride = $llmConfig.temperature != null;
      settingsTemperature = $llmConfig.temperature ?? 0.7;
    });
    generateResult = localStorage.getItem('llm-generate-result') ?? '';
  });

  $effect(() => {
    localStorage.setItem('llm-generate-result', generateResult);
  });

  async function saveSettings() {
    await saveConfig({
      provider: settingsProvider,
      model: settingsModel,
      baseUrl: settingsProvider === 'ollama' ? settingsBaseUrl : undefined,
      apiKey: settingsProvider !== 'ollama' ? settingsApiKey : undefined,
      maxTokens: settingsMaxTokens,
      temperature: settingsTempOverride ? settingsTemperature : undefined,
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
      `You have access to the vault filesystem via these tools:\n` +
      `- **list_files(path)**: Lists .md files in a vault directory\n` +
      `- **list_json_files(path)**: Lists .json files (encounters, monsters)\n` +
      `- **read_file(path)**: Reads any vault file (markdown or JSON)\n` +
      `- **write_file(path, content)**: Creates or overwrites a vault file (parent dirs auto-created)\n\n` +
      `Vault structure:\n` +
      `\`\`\`\nvault/\n  monsters/*.json              ← global monster library\n  campaigns/{slug}/\n    campaign.md\n    sessions/*.md\n    npcs/*.md\n    world/*.md\n    acts/{act-slug}/\n      index.md                 ← the act itself\n      encounters/*.json        ← act encounters\n      monsters/*.json          ← act-specific monster variants (override global)\n\`\`\`\n\nMonster lookup order: act-local → global library. ` +
      `Use act-local monsters (acts/{act}/monsters/{slug}.json) for encounter-specific variants or new creatures specific to this act. ` +
      `Use the global library (vault/monsters/{slug}.json) for reusable monsters that appear across campaigns.` +
      campaignHint +
      `\n\n## Document Templates\n` +
      `Canonical templates for all document types are in \`./vault/templates/\`:\n` +
      `- \`campaign.md\` — campaign overview (Prämisse, Hauptkonflikt, Fraktionen, SCs, Ton, Geheimnisse)\n` +
      `- \`act.md\` — act structure (Summary, Ergebnis, Details)\n` +
      `- \`session.md\` — session notes (Summary, Ergebnis, Details)\n` +
      `- \`npc.md\` — NPC profile (Summary, Motivationen, Details)\n` +
      `- \`world.md\` — world entry (Summary, Details)\n` +
      `- \`encounter.json\` — encounter schema\n` +
      `- \`monster.json\` — monster schema\n\n` +
      `When creating a new file, read the matching template first and follow its structure. ` +
      `Filenames use kebab-case slugs. ` +
      `Workflow: read relevant files first to understand current state, then act. ` +
      `When a task involves an act and its encounter, update BOTH files. ` +
      `Write complete, well-structured content. Summarize what you did at the end.`
    );
  }

  const JSON_FILE_TYPES = new Set(['monster', 'encounter', 'npc']);

  function stripJsonFences(content: string): string {
    const match = content.trim().match(/^```json\s*\n([\s\S]*?)\n```\s*$/);
    return match ? match[1] : content;
  }

  function applyReplace(content: string) {
    const cleaned = $activeFile && JSON_FILE_TYPES.has($activeFile.type)
      ? stripJsonFences(content)
      : content;
    replaceContent(cleaned);
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

    const controller = new AbortController();
    agentAbortController = controller;

    const options: AgentOptions = {
      onStep: (step) => { agentSteps = [...agentSteps, step]; },
      writeFile: agentWriteFile,
      signal: controller.signal,
    };

    try {
      if (!client.agentLoop) {
        throw new Error('Dieser Provider unterstützt kein Tool Calling. Bitte Groq, xAI oder Anthropic wählen.');
      }
      await client.agentLoop(task, buildAgentSystemPrompt(), options);
    } catch (e) {
      agentError = e instanceof Error ? e.message : String(e);
    } finally {
      agentRunning = false;
      agentAbortController = null;
    }
  }

  function stopAgent() {
    agentAbortController?.abort();
  }

  async function sendMessage() {
    if (!input.trim() || $llmLoading) return;

    const userMsg = input.trim();
    input = '';
    llmLoading.set(true);

    try {
      if (mode === 'chat') {
        // History VOR dem Update snapshot — dann userMsg anhängen
        const history = $llmMessages;
        llmMessages.update((msgs) => [...msgs, { role: 'user', content: userMsg }]);

        const messages = [
          { role: 'system' as const, content: $systemPrompt },
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: userMsg },
        ];

        const response = await client.chat(messages, 'chat');
        llmMessages.update((msgs) => [...msgs, { role: 'assistant', content: response }]);
      } else {
        generateResult = '...';
        generateResult = await client.generate(userMsg, $systemPrompt, 'creative');
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

  function toggleFlag(key: keyof ContextFlags) {
    contextFlags.update((f) => ({ ...f, [key]: !f[key] }));
  }

  function toggleMonsterGroup(group: string) {
    contextFlags.update((f) => {
      const active = f.monsterGroups.includes(group)
        ? f.monsterGroups.filter((g) => g !== group)
        : [...f.monsterGroups, group];
      return { ...f, monsterGroups: active };
    });
  }

  let monsterGroupList = $derived.by(() => {
    const groups = new Map<string, number>();
    for (const m of $monsterLibrary) {
      groups.set(m.group, (groups.get(m.group) ?? 0) + 1);
    }
    return [...groups.entries()].map(([group, count]) => ({ group, count }));
  });

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
    showNewFile = false;
    newFileSaveStatus = 'idle';
  }

  function fmtTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  // ── JSON-Block-Erkennung (Phase 3b) ───────────────────────────────────────

  interface DetectedJson {
    type: 'monster' | 'encounter';
    data: Record<string, unknown>;
    raw: string;
  }

  function extractJsonBlocks(text: string): DetectedJson[] {
    const results: DetectedJson[] = [];
    const regex = /```json\n([\s\S]*?)\n```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>;
        if ('cr' in data && 'stats' in data) {
          results.push({ type: 'monster', data, raw: match[1] });
        } else if ('monsters' in data && 'difficulty' in data) {
          results.push({ type: 'encounter', data, raw: match[1] });
        }
      } catch { /* ignorieren */ }
    }
    return results;
  }

  function slugify(name: string): string {
    const umlautMap: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
    return name
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => umlautMap[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  let saveStatus = $state<Record<number, 'saving' | 'saved' | 'error'>>({});

  // ── Markdown-Erkennung ───────────────────────────────────────────────────────

  function looksLikeMarkdown(text: string): boolean {
    return /^#{1,6}\s/m.test(text) ||
      /\*\*.+?\*\*/s.test(text) ||
      /```[\s\S]*?```/.test(text) ||
      /^[-*]\s/m.test(text) ||
      /^\d+\.\s/m.test(text) ||
      /^>\s/m.test(text);
  }

  let generateIsMarkdown = $derived(generateResult ? looksLikeMarkdown(generateResult) : false);

  // ── Antwort-Aktionen ─────────────────────────────────────────────────────────

  let copied = $state(false);
  let copiedMsgIndex = $state<number | null>(null);
  let showNewFile = $state(false);
  let newFilePath = $state('');
  let newFileSaveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let newFileMsgIndex = $state<number | null>(null);
  let newFileMsgPath = $state('');
  let newFileMsgStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => { copied = false; }, 1500);
  }

  async function copyMessage(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    copiedMsgIndex = idx;
    setTimeout(() => { copiedMsgIndex = null; }, 1500);
  }

  function suggestNewFilePath(): string {
    const file = $activeFile;
    const campaign = $activeCampaign;

    if (file) {
      const lastSlash = file.path.lastIndexOf('/');
      const dir = lastSlash >= 0 ? file.path.slice(0, lastSlash + 1) : './vault/';
      const defaultNames: Record<string, string> = {
        session:   'neue-session.md',
        npc:       'neuer-npc.md',
        world:     'neuer-ort.md',
        encounter: 'neuer-encounter.json',
        monster:   'neues-monster.json',
        character: 'neuer-charakter.md',
        act:       'neuer-akt/index.md',
        campaign:  'neue-kampagne.md',
      };
      return `${dir}${defaultNames[file.type] ?? 'neue-datei.md'}`;
    }

    if (campaign) return `./vault/campaigns/${campaign.path}/sessions/neue-session.md`;
    return './vault/neue-datei.md';
  }

  async function saveAsNewFile(content: string): Promise<void> {
    if (!newFilePath.trim()) return;
    newFileSaveStatus = 'saving';
    try {
      await invoke('write_file_content', { path: newFilePath.trim(), content });
      invalidateVault();
      newFileSaveStatus = 'saved';
    } catch {
      newFileSaveStatus = 'error';
    }
  }

  async function saveAsNewFileMsg(content: string): Promise<void> {
    if (!newFileMsgPath.trim()) return;
    newFileMsgStatus = 'saving';
    try {
      await invoke('write_file_content', { path: newFileMsgPath.trim(), content });
      invalidateVault();
      newFileMsgStatus = 'saved';
    } catch {
      newFileMsgStatus = 'error';
    }
  }

  async function saveJsonBlock(block: DetectedJson, index: number): Promise<void> {
    const campaign = $activeCampaign;
    if (!campaign) return;
    saveStatus = { ...saveStatus, [index]: 'saving' };
    try {
      const name = (block.data.name as string) || 'unbekannt';
      const slug = slugify(name);
      const path =
        block.type === 'monster'
          ? `./vault/monsters/${slug}.json`
          : `./vault/campaigns/${campaign.path}/encounters/${slug}.json`;
      await invoke('write_file_content', { path, content: JSON.stringify(block.data, null, 2) });
      invalidateVault();
      if (block.type === 'encounter') loadEncounterContext(campaign.path);
      saveStatus = { ...saveStatus, [index]: 'saved' };
    } catch {
      saveStatus = { ...saveStatus, [index]: 'error' };
    }
  }

  // Reaktiv: JSON-Blöcke aus dem generate-Ergebnis extrahieren
  let detectedBlocks = $derived(generateResult ? extractJsonBlocks(generateResult) : []);

  // ── Code-Block-Parsing für Aktions-Buttons ────────────────────────────────

  interface Segment {
    type: 'text' | 'code';
    content: string;
    lang?: string;
  }

  function parseSegments(text: string): Segment[] {
    const segments: Segment[] = [];
    const regex = /```([\w]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'code', lang: match[1] ?? '', content: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push({ type: 'text', content: text.slice(lastIndex) });
    }
    return segments;
  }

  function hasCodeBlock(text: string): boolean {
    return /```[\w]*\n[\s\S]*?```/.test(text);
  }

  // State für Code-Block-Aktionen (Key: z.B. "msg-3-block-1" oder "gen-block-0")
  let blockCopied = $state<Record<string, boolean>>({});
  let blockNewFile = $state<Record<string, boolean>>({});
  let blockNewFilePath = $state<Record<string, string>>({});
  let blockNewFileStatus = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  async function copyBlock(key: string, content: string) {
    await navigator.clipboard.writeText(content);
    blockCopied[key] = true;
    setTimeout(() => { blockCopied[key] = false; }, 1500);
  }

  function toggleBlockFile(key: string) {
    if (blockNewFile[key]) {
      blockNewFile[key] = false;
    } else {
      blockNewFile[key] = true;
      if (!blockNewFilePath[key]) blockNewFilePath[key] = suggestNewFilePath();
      blockNewFileStatus[key] = 'idle';
    }
  }

  async function saveBlock(key: string, content: string) {
    if (!blockNewFilePath[key]?.trim()) return;
    blockNewFileStatus[key] = 'saving';
    try {
      await invoke('write_file_content', { path: blockNewFilePath[key].trim(), content });
      invalidateVault();
      blockNewFileStatus[key] = 'saved';
    } catch {
      blockNewFileStatus[key] = 'error';
    }
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

      <div class="settings-row">
        <label>Max Tokens</label>
        <input type="number" bind:value={settingsMaxTokens} min="256" max="32000" step="256" />
      </div>

      <div class="settings-row temp-row">
        <label class="temp-toggle">
          <input type="checkbox" bind:checked={settingsTempOverride} />
          Temperatur überschreiben
        </label>
        {#if settingsTempOverride}
          <input class="temp-value" type="number" bind:value={settingsTemperature} min="0" max="1" step="0.1" />
        {/if}
      </div>
      {#if settingsTempOverride}
        <p class="settings-hint">
          {#if settingsProvider === 'anthropic' && !modelSupportsTemperature(settingsModel)}
            ⚠ {settingsModel} ignoriert Temperatur — Steuerung erfolgt über effort/Prompting.
          {:else}
            Überschreibt die kontextabhängigen Presets (Übersetzung, Agent, …) global.
          {/if}
        </p>
      {/if}

      <div class="settings-footer">
        {#if settingsProvider !== 'ollama' && $llmConfig.apiKey}
          <button class="delete-key-btn" onclick={handleDeleteKey}>Key löschen</button>
        {/if}
        <button class="save-btn" onclick={saveSettings}>Speichern</button>
      </div>
    </div>
  {/if}

  <!-- Context-Badges (nicht im Debug-Modus) -->
  {#if mode !== 'debug' && mode !== 'agent'}
  <div class="context-bar">
    <div class="ctx-badges">
      {#if $campaignContent}
        <button class="ctx-badge narrative" class:off={!$contextFlags.campaign} onclick={() => toggleFlag('campaign')}>
          Kampagne
        </button>
      {/if}
      {#if $campaignCharacterData.length > 0}
        <button class="ctx-badge narrative" class:off={!$contextFlags.characters} onclick={() => toggleFlag('characters')}
          title={$campaignCharacterData.map((c) => c.name).join(', ')}>
          {$campaignCharacterData.length === 1 ? $campaignCharacterData[0].name : `${$campaignCharacterData.length} Chars`}
        </button>
      {/if}
      {#if $actSummaries.length > 0}
        <button class="ctx-badge narrative" class:off={!$contextFlags.acts} onclick={() => toggleFlag('acts')}>
          {$actSummaries.length} Akte
        </button>
      {/if}
      {#if $encounterSummaries.length > 0}
        <button class="ctx-badge narrative" class:off={!$contextFlags.encounters} onclick={() => toggleFlag('encounters')}>
          {$encounterSummaries.length} Enc
        </button>
      {/if}
      {#each monsterGroupList as { group, count }}
        <button
          class="ctx-badge level-library"
          class:off={!$contextFlags.monsterGroups.includes(group)}
          title="Monster-Gruppe: {monsterTypeLabel(group)}"
          onclick={() => toggleMonsterGroup(group)}
        >{monsterTypeLabel(group)} ({count})</button>
      {/each}
      {#if $activeFile}
        {@const fileLevelClass = {
          campaign: 'level-campaign', npc: 'level-campaign', world: 'level-campaign', character: 'level-campaign', notes: 'level-campaign',
          act: 'level-act',
          session: 'level-session',
          encounter: 'level-encounter',
          monster: 'level-library', spell: 'level-library', item: 'level-library',
        }[$activeFile.type] ?? 'level-campaign'}
        <button class="ctx-badge {fileLevelClass}" class:off={!$contextFlags.activeFile} onclick={() => toggleFlag('activeFile')}
          title={$activeFile.name}>
          📄 {$activeFile.name.length > 14 ? $activeFile.name.slice(0, 13) + '…' : $activeFile.name}
        </button>
      {/if}
      {#if $activeFile?.type === 'encounter'}
        <button class="ctx-badge level-encounter" class:off={!$contextFlags.encounterMonsters} onclick={() => toggleFlag('encounterMonsters')}
          title="Vollständige Monster-Definitionen dieses Encounters">
          {$encounterMonsterDefs.length > 0 ? $encounterMonsterDefs.length : '?'} Mon↑
        </button>
      {/if}
      {#if $activeFile}
        <button class="ctx-badge pin-badge" onclick={handlePinActive} title="Anpinnen">+ Pin</button>
      {/if}
    </div>
    <button
      class="icon-btn"
      onclick={() => (showPrompt = !showPrompt)}
      title="System-Prompt anzeigen">{showPrompt ? '▲' : '▼'}</button
    >
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
      {#each $llmMessages as msg, i}
        <div class="message {msg.role}">
          <span class="role">{msg.role === 'user' ? 'Du' : 'KI'}</span>
          {#if msg.role === 'assistant' && hasCodeBlock(msg.content)}
            {#each parseSegments(msg.content) as seg, si}
              {#if seg.type === 'code'}
                {@const bk = `msg-${i}-${si}`}
                <div class="code-block-wrap">
                  <div class="block-action-bar">
                    {#if seg.lang}<span class="block-lang">{seg.lang}</span>{/if}
                    <button class="block-btn" onclick={() => copyBlock(bk, seg.content)} title="Kopieren">{blockCopied[bk] ? '✓' : '⎘'}</button>
                    {#if $activeFile}
                      <button class="block-btn" onclick={() => appendContent(seg.content)}>+ Anhängen</button>
                      <button class="block-btn" onclick={() => applyReplace(seg.content)}>↺ Ersetzen</button>
                    {/if}
                    <button class="block-btn" onclick={() => toggleBlockFile(bk)}>+ Datei</button>
                  </div>
                  <pre class="code-block"><code>{seg.content}</code></pre>
                  {#if blockNewFile[bk]}
                    <div class="block-file-row">
                      <input class="new-file-input" bind:value={blockNewFilePath[bk]} placeholder="./vault/campaigns/.../datei.md" />
                      <button class="new-file-save-btn" disabled={blockNewFileStatus[bk] === 'saving' || !blockNewFilePath[bk]?.trim()} onclick={() => saveBlock(bk, seg.content)}>
                        {blockNewFileStatus[bk] === 'saving' ? '…' : blockNewFileStatus[bk] === 'saved' ? '✓' : blockNewFileStatus[bk] === 'error' ? '✕' : 'Speichern'}
                      </button>
                    </div>
                  {/if}
                </div>
              {:else if seg.content.trim()}
                {#if looksLikeMarkdown(seg.content)}
                  <div class="md-response">{@html marked(seg.content)}</div>
                {:else}
                  <p>{seg.content}</p>
                {/if}
              {/if}
            {/each}
          {:else if msg.role === 'assistant' && looksLikeMarkdown(msg.content)}
            <div class="md-response">{@html marked(msg.content)}</div>
          {:else}
            <p>{msg.content}</p>
          {/if}
          {#if msg.role === 'assistant'}
            <div class="msg-apply-row">
              <button class="msg-apply-btn copy" onclick={() => copyMessage(msg.content, i)} title="Kopieren">
                {copiedMsgIndex === i ? '✓' : '⎘'}
              </button>
              {#if $activeFile}
                <button class="msg-apply-btn append" onclick={() => appendContent(msg.content)}>+ Anhängen</button>
                <button class="msg-apply-btn replace" onclick={() => applyReplace(msg.content)}>↺ Ersetzen</button>
              {/if}
              <button class="msg-apply-btn new-file" onclick={() => { if (newFileMsgIndex === i) { newFileMsgIndex = null; } else { newFileMsgIndex = i; newFileMsgPath = suggestNewFilePath(); newFileMsgStatus = 'idle'; } }}>
                + Datei
              </button>
            </div>
            {#if newFileMsgIndex === i}
              <div class="new-file-row">
                <input class="new-file-input" bind:value={newFileMsgPath} placeholder="./vault/campaigns/.../neue-datei.md" />
                <button
                  class="new-file-save-btn"
                  disabled={newFileMsgStatus === 'saving' || !newFileMsgPath.trim()}
                  onclick={() => saveAsNewFileMsg(msg.content)}
                >
                  {newFileMsgStatus === 'saving' ? '…' : newFileMsgStatus === 'saved' ? '✓' : newFileMsgStatus === 'error' ? '✕' : 'Speichern'}
                </button>
              </div>
            {/if}
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
            <div class="header-actions">
              <button class="icon-btn" onclick={() => copyText(generateResult)} title="In Zwischenablage kopieren">
                {copied ? '✓' : '⎘'}
              </button>
              <button class="icon-btn" onclick={clearGenerate}>✕</button>
            </div>
          </div>
          {#if hasCodeBlock(generateResult)}
            {#each parseSegments(generateResult) as seg, si}
              {#if seg.type === 'code'}
                {@const bk = `gen-${si}`}
                <div class="code-block-wrap">
                  <div class="block-action-bar">
                    {#if seg.lang}<span class="block-lang">{seg.lang}</span>{/if}
                    <button class="block-btn" onclick={() => copyBlock(bk, seg.content)} title="Kopieren">{blockCopied[bk] ? '✓' : '⎘'}</button>
                    {#if $activeFile}
                      <button class="block-btn" onclick={() => appendContent(seg.content)}>+ Anhängen</button>
                      <button class="block-btn" onclick={() => applyReplace(seg.content)}>↺ Ersetzen</button>
                    {/if}
                    <button class="block-btn" onclick={() => toggleBlockFile(bk)}>+ Datei</button>
                  </div>
                  <pre class="code-block"><code>{seg.content}</code></pre>
                  {#if blockNewFile[bk]}
                    <div class="block-file-row">
                      <input class="new-file-input" bind:value={blockNewFilePath[bk]} placeholder="./vault/campaigns/.../datei.md" />
                      <button class="new-file-save-btn" disabled={blockNewFileStatus[bk] === 'saving' || !blockNewFilePath[bk]?.trim()} onclick={() => saveBlock(bk, seg.content)}>
                        {blockNewFileStatus[bk] === 'saving' ? '…' : blockNewFileStatus[bk] === 'saved' ? '✓' : blockNewFileStatus[bk] === 'error' ? '✕' : 'Speichern'}
                      </button>
                    </div>
                  {/if}
                </div>
              {:else if seg.content.trim()}
                {#if looksLikeMarkdown(seg.content)}
                  <div class="md-response">{@html marked(seg.content)}</div>
                {:else}
                  <p>{seg.content}</p>
                {/if}
              {/if}
            {/each}
          {:else if generateIsMarkdown}
            <div class="md-response">{@html marked(generateResult)}</div>
          {:else}
            <p>{generateResult}</p>
          {/if}
          <div class="apply-row">
            <button class="apply-btn append" disabled={!$activeFile} onclick={() => { appendContent(generateResult); clearGenerate(); }}>
              + Anhängen
            </button>
            <button class="apply-btn replace" disabled={!$activeFile} onclick={() => { applyReplace(generateResult); clearGenerate(); }}>
              ↺ Ersetzen
            </button>
            <button class="apply-btn new-file" onclick={() => { showNewFile = !showNewFile; if (showNewFile) { newFilePath = suggestNewFilePath(); newFileSaveStatus = 'idle'; } }}>
              + Datei
            </button>
          </div>
          {#if showNewFile}
            <div class="new-file-row">
              <input
                class="new-file-input"
                bind:value={newFilePath}
                placeholder="./vault/campaigns/.../neue-datei.md"
              />
              <button
                class="new-file-save-btn"
                disabled={newFileSaveStatus === 'saving' || !newFilePath.trim()}
                onclick={() => saveAsNewFile(generateResult)}
              >
                {newFileSaveStatus === 'saving' ? '…' : newFileSaveStatus === 'saved' ? '✓' : newFileSaveStatus === 'error' ? '✕' : 'Speichern'}
              </button>
            </div>
          {/if}
          {#if detectedBlocks.length > 0}
            <div class="json-save-row">
              {#each detectedBlocks as block, i}
                <button
                  class="json-save-btn"
                  class:saved={saveStatus[i] === 'saved'}
                  class:error={saveStatus[i] === 'error'}
                  disabled={saveStatus[i] === 'saving' || saveStatus[i] === 'saved'}
                  onclick={() => saveJsonBlock(block, i)}
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
              <button class="template-btn" onclick={() => (input = `Erstelle einen Encounter für 2 Spieler auf Level 6 mit Schwierigkeit schwer. Gib das JSON im Encounter-Format aus.`)}>
                ⚔ Encounter
              </button>
              <button class="template-btn" onclick={() => (input = `Erstelle ein Monster: Goblin-Anführer, HG 2. Gib das JSON im Monster-Format aus.`)}>
                🐉 Monster
              </button>
              <button class="template-btn" onclick={() => (input = `Erstelle einen Boss-Gegner, HG 8, passend zur aktiven Kampagne. Gib das JSON im Monster-Format aus.`)}>
                💀 Boss
              </button>
            </div>
          {/if}
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
            "Passe Akt 2 an — Spieler haben den Turm übersprungen"<br>
            "Erstelle einen Encounter für Akt 2, Schwierigkeit schwer, 2 Spieler Level 6"<br>
            "Harlon wurde enttarnt — passe Akt 3 und seinen Encounter an"
          </p>
          {#if !client.capabilities.tools}
            <p class="agent-warning">⚠ Dieser Provider unterstützt kein Tool Calling. Bitte Groq, xAI oder Anthropic wählen.</p>
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
        {#if agentRunning}
          <button onclick={stopAgent} class="agent-stop-btn">Stop</button>
        {/if}
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
    background: var(--bg-panel);
    border-left: 1px solid var(--surface);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Mode bar */
  .mode-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    background: var(--bg-deep);
    position: relative;
    flex-shrink: 0;
  }

  .mode-btn {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
  }

  .mode-btn.active {
    background: var(--red);
    color: var(--bg);
    border-color: var(--red);
  }

  .settings-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.15rem 0.4rem;
  }

  .settings-btn.active {
    color: var(--gold);
    border-color: var(--gold);
  }

  /* Provider badge */
  .provider-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--surface);
    flex-shrink: 0;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
  }

  .badge.ollama    { background: var(--bg-raised); color: var(--green); }
  .badge.anthropic { background: var(--bg-raised); color: var(--arcane); }
  .badge.groq      { background: var(--bg-deep); color: var(--copper); }
  .badge.xai       { background: var(--bg-raised); color: var(--steel); }

  .model-name {
    font-size: 0.68rem;
    color: var(--border);
  }

  .token-stats {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .token-item {
    font-size: 0.65rem;
    color: var(--border);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .token-session { color: var(--ink-muted); }
  .token-sep { font-size: 0.6rem; color: var(--surface); }

  .token-reset {
    background: transparent;
    border: none;
    color: var(--border);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
    line-height: 1;
    border-radius: 0;
  }

  .token-reset:hover { color: var(--ink-muted); }

  /* Settings panel */
  .settings-panel {
    background: var(--bg-deep);
    border-bottom: 1px solid var(--surface);
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
    color: var(--ink-muted);
    width: 52px;
    flex-shrink: 0;
  }

  .settings-row input,
  .settings-row select {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
    font-family: inherit;
    outline: none;
    min-width: 0;
  }

  .temp-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: auto;
    cursor: pointer;
  }

  .temp-toggle input[type='checkbox'] {
    flex: none;
    width: auto;
    min-width: 0;
    padding: 0;
    cursor: pointer;
  }

  .temp-value {
    flex: none !important;
    max-width: 64px;
  }

  .settings-hint {
    font-size: 0.65rem;
    color: var(--ink-muted);
    margin: 0.1rem 0 0;
    line-height: 1.3;
  }

  .settings-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.1rem;
  }

  .save-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.8rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }

  .delete-key-btn {
    background: transparent;
    color: var(--danger);
    border: 1px solid var(--danger);
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .mode-hint {
    font-size: 0.65rem;
    color: var(--border);
    margin-left: 0.25rem;
  }

  /* Context bar */
  .context-bar {
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--bg);
    flex-shrink: 0;
  }

  .ctx-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .ctx-badge {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.1rem 0.55rem;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
    white-space: nowrap;
  }

  .ctx-badge:hover { background: var(--border); }

  .ctx-badge.off {
    opacity: 0.35;
    text-decoration: line-through;
  }

  /* Kampagnen-Ebene: Kampagne, Akte, Enc + campaign/npc/world/character-Dateien */
  .ctx-badge.narrative,
  .ctx-badge.level-campaign { border-color: var(--green); color: var(--green); }
  .ctx-badge.narrative.off,
  .ctx-badge.level-campaign.off { border-color: var(--border); color: var(--ink-muted); }

  /* Akt-Ebene */
  .ctx-badge.level-act { border-color: var(--red); color: var(--red); }
  .ctx-badge.level-act.off { border-color: var(--border); color: var(--ink-muted); }

  /* Session-Ebene (Chronik) */
  .ctx-badge.level-session { border-color: var(--teal); color: var(--teal); }
  .ctx-badge.level-session.off { border-color: var(--border); color: var(--ink-muted); }

  /* Encounter-Ebene: encounter-Datei + Mon↑ */
  .ctx-badge.level-encounter { border-color: var(--arcane); color: var(--arcane); }
  .ctx-badge.level-encounter.off { border-color: var(--border); color: var(--ink-muted); }

  /* Bibliotheks-Ebene: monster-Datei + Mon-Bibliothek */
  .ctx-badge.mechanic,
  .ctx-badge.level-library { border-color: var(--copper); color: var(--copper); }
  .ctx-badge.mechanic.off,
  .ctx-badge.level-library.off { border-color: var(--border); color: var(--ink-muted); }

  .ctx-badge.pin-badge {
    border-color: var(--ink-muted);
    color: var(--ink-muted);
    background: transparent;
  }
  .ctx-badge.pin-badge:hover { background: var(--surface); }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.15rem 0.3rem;
  }

  /* Pinned list */
  .pinned-list {
    border-bottom: 1px solid var(--surface);
    background: var(--bg);
    flex-shrink: 0;
  }

  .pin-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid var(--bg-raised);
    font-size: 0.72rem;
  }

  .pin-row:last-child { border-bottom: none; }

  .pin-icon { flex-shrink: 0; font-size: 0.7rem; }

  .pin-name {
    flex: 1;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pin-row.is-char .pin-name { color: var(--danger); }

  .detail-toggle {
    display: flex;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .detail-btn {
    background: var(--surface);
    color: var(--ink-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.1rem 0.3rem;
    font-size: 0.65rem;
    cursor: pointer;
    font-weight: 600;
  }

  .detail-btn.active {
    background: var(--danger);
    color: var(--bg);
    border-color: var(--danger);
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: var(--border);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
  }

  .remove-btn:hover { color: var(--danger); }

  /* Prompt preview */
  .prompt-preview {
    background: var(--bg-deep);
    border-bottom: 1px solid var(--surface);
    padding: 0.5rem 0.75rem;
    resize: vertical;
    overflow: auto;
    height: 150px;
    min-height: 60px;
    flex-shrink: 0;
  }

  .prompt-preview pre {
    margin: 0;
    font-size: 0.65rem;
    color: var(--ink-muted);
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
    background: var(--bg);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .message.user { background: var(--surface); }

  .role {
    font-size: 0.75rem;
    color: var(--ink-muted);
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
  }

  .message p, .generate-result p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink);
    white-space: pre-wrap;
  }

  .md-response {
    font-size: 0.88rem;
    color: var(--ink);
    line-height: 1.6;
  }

  .md-response :global(h1) { color: var(--arcane); font-size: 1.05rem; font-weight: 700; margin: 0.5rem 0 0.3rem; }
  .md-response :global(h2) { color: var(--red); font-size: 0.95rem; font-weight: 700; margin: 0.75rem 0 0.25rem; }
  .md-response :global(h3) { color: var(--teal); font-size: 0.88rem; font-weight: 700; margin: 0.5rem 0 0.2rem; }
  .md-response :global(p) { margin: 0 0 0.5rem; }
  .md-response :global(p:last-child) { margin-bottom: 0; }
  .md-response :global(ul), .md-response :global(ol) { padding-left: 1.25rem; margin: 0 0 0.5rem; }
  .md-response :global(li) { margin-bottom: 0.15rem; }
  .md-response :global(code) { background: var(--surface); padding: 0.1em 0.35em; border-radius: 3px; font-family: monospace; font-size: 0.82em; }
  .md-response :global(pre) { background: var(--bg-deep); border-radius: 5px; padding: 0.5rem 0.7rem; overflow-x: auto; margin: 0 0 0.5rem; }
  .md-response :global(pre code) { background: none; padding: 0; font-size: 0.8rem; }
  .md-response :global(strong) { color: var(--danger); font-weight: 700; }
  .md-response :global(em) { color: var(--arcane); }
  .md-response :global(blockquote) { border-left: 3px solid var(--border); padding-left: 0.6rem; color: var(--ink-muted); margin: 0.4rem 0; font-style: italic; }
  .md-response :global(hr) { border: none; border-top: 1px solid var(--surface); margin: 0.6rem 0; }

  .loading p { color: var(--ink-muted); }

  .msg-apply-row {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--surface);
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

  .msg-apply-btn.copy     { background: var(--surface); color: var(--ink); border: 1px solid var(--border); flex: 0 0 auto; min-width: 2rem; }
  .msg-apply-btn.append  { background: var(--green); color: var(--bg); }
  .msg-apply-btn.replace { background: var(--gold); color: var(--bg); }
  .msg-apply-btn.new-file { background: var(--red); color: var(--bg); }

  /* Generate */
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

  .new-file-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }

  .new-file-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font-size: 0.7rem;
    font-family: monospace;
    outline: none;
    min-width: 0;
  }

  .new-file-input:focus { border-color: var(--red); }

  .new-file-save-btn {
    background: var(--red);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }

  .new-file-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Code-Block mit Aktions-Bar ── */
  .code-block-wrap {
    margin: 0.5rem 0;
    border: 1px solid var(--surface);
    border-radius: 6px;
    overflow: hidden;
  }

  .block-action-bar {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    background: var(--bg);
    border-bottom: 1px solid var(--surface);
    flex-wrap: wrap;
  }

  .block-lang {
    font-size: 0.7rem;
    color: var(--ink-muted);
    font-family: monospace;
    flex: 1;
  }

  .block-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.72rem;
    padding: 0.1rem 0.4rem;
    white-space: nowrap;
  }

  .block-btn:hover {
    background: var(--surface);
    color: var(--ink);
  }

  .code-block {
    margin: 0;
    padding: 0.6rem 0.75rem;
    background: var(--bg-deep);
    color: var(--ink);
    font-size: 0.8rem;
    overflow-x: auto;
    white-space: pre;
  }

  .block-file-row {
    display: flex;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    background: var(--bg);
    border-top: 1px solid var(--surface);
  }

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
    cursor: pointer;
    transition: background 0.15s;
  }

  .template-btn:hover { background: var(--border); }

  /* Input */
  .input-row {
    padding: 0.75rem;
    border-top: 1px solid var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  textarea {
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 6px;
    color: var(--ink);
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
    background: var(--arcane);
    color: var(--bg);
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
    background: var(--surface);
    color: var(--ink);
    flex: 0 0 auto;
  }

  .input-buttons button:last-child { flex: 1; }

  /* Agent-Tab Button */
  .mode-btn.agent-tab.active {
    background: var(--green);
    color: var(--bg);
    border-color: var(--green);
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
    color: var(--ink-muted);
    line-height: 1.5;
  }

  .agent-hint {
    font-size: 0.72rem !important;
    color: var(--border) !important;
    font-style: italic;
    background: var(--bg-deep);
    border-radius: 6px;
    padding: 0.5rem 0.75rem !important;
    line-height: 1.8 !important;
  }

  .agent-warning {
    font-size: 0.75rem !important;
    color: var(--gold) !important;
    background: var(--bg-raised);
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
    border-bottom: 1px solid var(--bg);
  }

  .step-icon {
    flex-shrink: 0;
    font-size: 0.8rem;
    width: 1.1rem;
    text-align: center;
  }

  .agent-step.tool-call { background: var(--bg-panel); }
  .agent-step.tool-result { background: var(--bg-deep); padding-left: 2.1rem; }
  .agent-step.done { background: var(--bg-raised); border-top: 1px solid var(--green); margin-top: 0.25rem; align-items: flex-start; }
  .agent-step.running { color: var(--ink-muted); font-style: italic; }
  .agent-step.agent-err { color: var(--danger); background: var(--bg-deep); }

  .step-tool {
    color: var(--red);
    font-weight: 600;
    flex-shrink: 0;
  }

  .step-path {
    color: var(--ink-soft);
    font-size: 0.7rem;
    font-family: monospace;
    word-break: break-all;
  }

  .step-result {
    color: var(--ink-muted);
    font-size: 0.7rem;
    font-style: italic;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .step-done-text {
    color: var(--green);
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .agent-clear-btn {
    margin: 0.75rem;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
    cursor: pointer;
    flex-shrink: 0;
    align-self: flex-start;
  }

  .agent-run-btn {
    flex: 1;
    background: var(--green);
    color: var(--bg);
  }

  .agent-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .agent-stop-btn {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: 4px;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
    flex-shrink: 0;
  }
  .agent-stop-btn:hover { background: color-mix(in srgb, var(--danger) 15%, transparent); }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; }

  /* Debug-Tab Button */
  .debug-tab { position: relative; }

  .debug-badge {
    display: inline-block;
    background: var(--danger);
    color: var(--bg);
    border-radius: 8px;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0 0.3rem;
    margin-left: 0.2rem;
    vertical-align: middle;
    line-height: 1.4;
  }

  .mode-btn.debug-tab.active {
    background: var(--danger);
    color: var(--bg);
    border-color: var(--danger);
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
    border-bottom: 1px solid var(--surface);
    background: var(--bg-deep);
    flex-shrink: 0;
  }

  .debug-count {
    font-size: 0.7rem;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .debug-empty {
    padding: 2rem 1rem;
    text-align: center;
    font-size: 0.78rem;
    color: var(--border);
    line-height: 1.5;
  }

  .debug-entry {
    border-bottom: 1px solid var(--bg-raised);
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
    color: var(--ink);
    cursor: pointer;
    text-align: left;
    font-size: 0.72rem;
    font-family: inherit;
  }

  .debug-entry-header:hover { background: var(--bg); }

  .debug-type {
    font-size: 0.62rem;
    font-weight: 700;
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .debug-type.request  { background: var(--bg-raised); color: var(--green); }
  .debug-type.response { background: var(--bg-raised); color: var(--red); }
  .debug-type.error    { background: var(--bg-deep); color: var(--danger); }

  .debug-provider-label {
    font-size: 0.68rem;
    color: var(--red);
    font-weight: 600;
    flex-shrink: 0;
  }

  .debug-label-text {
    flex: 1;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .debug-meta {
    font-size: 0.65rem;
    color: var(--border);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .debug-chevron {
    font-size: 0.6rem;
    color: var(--border);
    flex-shrink: 0;
  }

  .debug-data {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.68rem;
    color: var(--ink-soft);
    background: var(--bg-deep);
    white-space: pre-wrap;
    word-break: break-all;
    border-top: 1px solid var(--bg-raised);
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }
</style>
