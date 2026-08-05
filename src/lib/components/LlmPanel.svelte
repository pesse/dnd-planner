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
  import { LLM_MODES, type LlmMode } from './llm/panelMode';
  import ModeBar from './llm/ModeBar.svelte';
  import ProviderBadge from './llm/ProviderBadge.svelte';
  import InputRow from './llm/InputRow.svelte';
  import ContextBadges from './llm/ContextBadges.svelte';
  import LlmSettingsPanel from './llm/LlmSettingsPanel.svelte';
  import LlmChatView from './llm/LlmChatView.svelte';
  import LlmGenerateView from './llm/LlmGenerateView.svelte';
  import LlmAgentView from './llm/LlmAgentView.svelte';
  import LlmDebugView from './llm/LlmDebugView.svelte';

  let input = $state('');
  const savedMode = localStorage.getItem('llm-mode') as LlmMode | null;
  let mode = $state<LlmMode>(savedMode && LLM_MODES.includes(savedMode) ? savedMode : 'generate');

  $effect(() => { localStorage.setItem('llm-mode', mode); });

  let client = $derived(getClient($llmConfig));

  let showSettings = $state(false);
  let generateResult = $state('');
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
      // Über `replaceContent`, nur so bleibt die Änderung in der Undo-Kette.
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
        // History VOR dem Update snapshotten, erst danach `userMsg` anhängen.
        const history = $llmMessages;
        llmMessages.update((msgs) => [...msgs, { role: 'user', content: userMsg }]);

        const messages = [
          { role: 'system' as const, content: $systemPrompt },
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: userMsg },
        ];

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
        // Deckt nicht-streamende Provider ab; beim Stream idempotent.
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
</script>

<div class="llm-panel">
  <ModeBar bind:mode bind:showSettings debugCount={$debugLog.length} />

  <ProviderBadge provider={$llmConfig.provider} model={$llmConfig.model} tokenStats={$tokenStats} onreset={resetTokenStats} />

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

  <InputRow {mode} bind:input {agentRunning} onsend={sendMessage} onagentrun={runAgent} onagentstop={stopAgent} />
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
</style>
