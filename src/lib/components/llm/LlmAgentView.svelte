<script lang="ts">
  /** Protokoll des Vault-Agenten: Werkzeugaufrufe, Ergebnisse, Abschluss und Fehler. */
  import type { AgentStep } from '../../services/vaultTools';

  let {
    steps,
    running,
    error,
    toolsSupported,
    onclear,
  }: {
    steps: AgentStep[];
    running: boolean;
    error: string;
    toolsSupported: boolean;
    onclear: () => void;
  } = $props();
</script>

<div class="agent-output">
  {#if steps.length === 0 && !running && !error}
    <div class="agent-placeholder">
      <p>Beschreibe eine Aufgabe — der Agent liest und schreibt selbstständig Vault-Dateien.</p>
      <p class="agent-hint">Beispiele:<br>
        "Erstelle Akt 3: Die Verräter"<br>
        "Füge NSC Mira die Händlerin hinzu"<br>
        "Passe Akt 2 an — Spieler haben den Turm übersprungen"<br>
        "Erstelle einen Encounter für Akt 2, Schwierigkeit schwer, 2 Spieler Level 6"<br>
        "Harlon wurde enttarnt — passe Akt 3 und seinen Encounter an"
      </p>
      {#if !toolsSupported}
        <p class="agent-warning">⚠ Dieser Provider unterstützt kein Tool Calling. Bitte Groq oder Anthropic wählen.</p>
      {/if}
    </div>
  {:else}
    <div class="agent-log">
      {#each steps as step, i (i)}
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

      {#if running}
        <div class="agent-step running">
          <span class="step-icon spin">⟳</span>
          <span>Agent arbeitet…</span>
        </div>
      {/if}

      {#if error}
        <div class="agent-step agent-err">
          <span class="step-icon">⚠</span>
          <span>{error}</span>
        </div>
      {/if}
    </div>

    {#if !running && (steps.length > 0 || error)}
      <button class="agent-clear-btn" onclick={onclear}>
        Neuer Auftrag
      </button>
    {/if}
  {/if}
</div>

<style>
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
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    align-self: flex-start;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
</style>
