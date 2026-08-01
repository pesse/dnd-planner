<script lang="ts">
  import { llmLoading, llmMessages, llmConfig, loadSavedConfig, tokenStats, resetTokenStats } from '../stores/llm';
  import { onMount } from 'svelte';
  import { systemPrompt } from '../stores/context';
  import { activeFile, activeCampaign, replaceContent, invalidateVault } from '../stores/campaign';
  import { getClient } from '../services/llmClient';
  import { composeToolsets, VAULT_TOOLSET } from '../services/vaultTools';
  import { RULES_TOOLSET } from '../services/rulesTools';
  import type { AgentStep, AgentOptions } from '../services/vaultTools';
  import { buildAgentSystemPrompt } from '../services/agentPrompt';
  import { writeNewFile } from '../services/responseArtifacts';
  import { debugLog } from '../stores/debug';
  import ContextBadges from './llm/ContextBadges.svelte';
  import LlmSettingsPanel from './llm/LlmSettingsPanel.svelte';
  import LlmChatView from './llm/LlmChatView.svelte';
  import LlmGenerateView from './llm/LlmGenerateView.svelte';
  import LlmAgentView from './llm/LlmAgentView.svelte';
  import LlmDebugView from './llm/LlmDebugView.svelte';

  type LlmMode = 'chat' | 'generate' | 'agent' | 'debug';

  let input = $state('');
  const VALID_MODES: LlmMode[] = ['chat', 'generate', 'agent', 'debug'];
  const savedMode = localStorage.getItem('llm-mode') as LlmMode | null;
  let mode = $state<LlmMode>(savedMode && VALID_MODES.includes(savedMode) ? savedMode : 'generate');

  $effect(() => { localStorage.setItem('llm-mode', mode); });

  // Aktueller LLM-Client (Provider-Adapter + Capabilities) — reaktiv zur Config.
  let client = $derived(getClient($llmConfig));

  let showSettings = $state(false);
  let generateResult = $state('');
  // Index der gerade live gestreamten Assistant-Nachricht in $llmMessages (null = kein Stream).
  let streamingIndex = $state<number | null>(null);

  let agentSteps = $state<AgentStep[]>([]);
  let agentRunning = $state(false);
  let agentError = $state('');
  let agentAbortController = $state<AbortController | null>(null);

  onMount(() => {
    loadSavedConfig();
    generateResult = localStorage.getItem('llm-generate-result') ?? '';
  });

  $effect(() => {
    localStorage.setItem('llm-generate-result', generateResult);
  });

  async function agentWriteFile(path: string, content: string): Promise<void> {
    const active = $activeFile;
    if (active && path === active.path) {
      // Aktive Datei über replaceContent — nur so bleibt sie in der Undo-Kette.
      replaceContent(content);
      invalidateVault();
    } else {
      await writeNewFile(path, content);
    }
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
        throw new Error('Dieser Provider unterstützt kein Tool Calling. Bitte Groq oder Anthropic wählen.');
      }
      await client.agentLoop(task, buildAgentSystemPrompt($systemPrompt, $activeCampaign), options, composeToolsets(VAULT_TOOLSET, RULES_TOOLSET));
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

        // Leeren Assistant-Platzhalter anlegen und live mit Token-Deltas füllen.
        let idx = -1;
        llmMessages.update((msgs) => { idx = msgs.length; return [...msgs, { role: 'assistant', content: '' }]; });
        streamingIndex = idx;
        const onDelta = (delta: string) => {
          llmMessages.update((msgs) => {
            const copy = [...msgs];
            copy[idx] = { ...copy[idx], content: copy[idx].content + delta };
            return copy;
          });
        };

        const response = await client.chat(messages, 'chat', onDelta);
        // Finalen Content setzen (deckt nicht-streamende Provider ab; bei Stream idempotent).
        llmMessages.update((msgs) => {
          const copy = [...msgs];
          copy[idx] = { ...copy[idx], content: response };
          return copy;
        });
      } else {
        generateResult = '';
        const response = await client.generate(userMsg, $systemPrompt, 'creative', (d) => { generateResult += d; });
        generateResult = response;
      }
    } catch (e) {
      const errMsg = `⚠️ Fehler: ${e instanceof Error ? e.message : JSON.stringify(e)}`;
      if (mode === 'chat') {
        // Platzhalter mit Fehler füllen statt eine zweite Nachricht anzuhängen.
        if (streamingIndex !== null) {
          const idx = streamingIndex;
          llmMessages.update((msgs) => {
            const copy = [...msgs];
            copy[idx] = { ...copy[idx], content: errMsg };
            return copy;
          });
        } else {
          llmMessages.update((msgs) => [...msgs, { role: 'assistant', content: errMsg }]);
        }
      } else {
        generateResult = errMsg;
      }
    } finally {
      streamingIndex = null;
      llmLoading.set(false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function fmtTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }
</script>

<div class="llm-panel">
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

  <div class="provider-badge">
    <span class="badge" class:ollama={$llmConfig.provider === 'ollama'} class:anthropic={$llmConfig.provider === 'anthropic'} class:groq={$llmConfig.provider === 'groq'} class:qualityminds={$llmConfig.provider === 'qualityminds'}>
      {$llmConfig.provider === 'ollama' ? '🦙 Ollama' : $llmConfig.provider === 'groq' ? '⚡ Groq' : $llmConfig.provider === 'qualityminds' ? '🟣 QualityMinds' : '✦ Anthropic'}
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

  {#if showSettings}
    <LlmSettingsPanel onclose={() => (showSettings = false)} />
  {/if}

  {#if mode !== 'debug' && mode !== 'agent'}
    <ContextBadges />
  {/if}

  {#if mode === 'chat'}
    <LlmChatView {streamingIndex} />
  {:else if mode === 'generate'}
    <LlmGenerateView
      result={generateResult}
      onclear={() => (generateResult = '')}
      onprompt={(text) => (input = text)}
    />
  {:else if mode === 'agent'}
    <LlmAgentView
      steps={agentSteps}
      running={agentRunning}
      error={agentError}
      toolsSupported={client.capabilities.tools}
      onclear={() => { agentSteps = []; agentError = ''; }}
    />
  {:else if mode === 'debug'}
    <LlmDebugView />
  {/if}

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
          <button class="clear-btn" onclick={() => llmMessages.set([])} disabled={$llmLoading}>Leeren</button>
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
  {/if}
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

  .mode-btn.agent-tab.active {
    background: var(--green);
    color: var(--bg);
    border-color: var(--green);
  }

  .mode-btn.debug-tab.active {
    background: var(--danger);
    color: var(--bg);
    border-color: var(--danger);
  }

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

  .mode-hint {
    font-size: 0.65rem;
    color: var(--border);
    margin-left: 0.25rem;
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
  .badge.qualityminds { background: var(--bg-raised); color: var(--arcane); }

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
</style>
