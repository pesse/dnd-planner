<script lang="ts">
  /**
   * Stapel-Upgrade der Charaktere: zeigt je Charakter, von welcher auf welche
   * Schemaversion er gezogen wird und welche Schritte greifen — und schreibt erst
   * auf Bestätigung. Die Pipeline selbst lebt im Schema
   * (`CHARACTER_UPGRADES` in schemas/character.ts).
   */
  import { onMount } from 'svelte';
  import { CHARACTER_VERSION } from '$lib/schemas/character';
  import {
    planCharacterUpgrades, applyCharacterUpgrades,
    type CharacterUpgradePlan, type CharacterUpgradeReport,
  } from '$lib/services/characterUpgrade';
  import { invalidateVault } from '$lib/stores/campaign';

  let { onclose }: { onclose: () => void } = $props();

  let plans = $state<CharacterUpgradePlan[]>([]);
  let loading = $state(true);
  let writing = $state(false);
  let report = $state<CharacterUpgradeReport | null>(null);

  let pending = $derived(plans.filter((p) => p.changed && !p.error));
  let failed = $derived(plans.filter((p) => p.error));

  async function load() {
    loading = true;
    report = null;
    plans = await planCharacterUpgrades();
    loading = false;
  }

  onMount(load);

  async function run() {
    writing = true;
    report = await applyCharacterUpgrades(plans);
    writing = false;
    invalidateVault();
    await load();
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>

<div class="dialog" role="dialog" aria-label="Charaktere aktualisieren">
  <div class="modal-header">
    <span class="modal-title">Charaktere aktualisieren</span>
    <button class="close-btn" onclick={onclose} title="Schließen">×</button>
  </div>

  <p class="hint">
    Aktuelle Schemaversion: <strong>v{CHARACTER_VERSION}</strong>. Ältere Dateien werden beim
    Öffnen ohnehin im Speicher gezogen — hier wird die Aktualisierung direkt in die
    Dateien geschrieben.
  </p>

  {#if loading}
    <p class="hint">Prüfe Charaktere…</p>
  {:else if !plans.length}
    <p class="hint">Keine Charaktere im Vault.</p>
  {:else}
    <div class="plan-list">
      {#each plans as plan}
        <div class="plan-row" class:pending={plan.changed && !plan.error} class:failed={!!plan.error}>
          <span class="plan-name">{plan.name}</span>
          <span class="plan-version">
            {#if plan.error}
              Datei nicht lesbar
            {:else if plan.changed}
              v{plan.fromVersion} → v{plan.toVersion}
            {:else}
              v{plan.fromVersion} · aktuell
            {/if}
          </span>
          <span class="plan-steps">
            {#if plan.error}
              {plan.error}
            {:else if plan.applied.length}
              {plan.applied.length} {plan.applied.length === 1 ? 'Schritt' : 'Schritte'}
            {:else if plan.changed}
              nur Versionsstempel
            {:else}
              —
            {/if}
          </span>
        </div>
        {#if plan.applied.length && plan.changed}
          <ul class="step-list">
            {#each plan.applied as step}<li>{step}</li>{/each}
          </ul>
        {/if}
      {/each}
    </div>

    <div class="actions">
      <span class="hint">
        {pending.length
          ? `${pending.length} von ${plans.length} zu aktualisieren`
          : 'Alle Charaktere sind aktuell'}{failed.length ? ` · ${failed.length} nicht lesbar` : ''}
      </span>
      <button class="primary-btn" onclick={run} disabled={writing || !pending.length}>
        {writing ? 'Schreibe…' : 'Alle schreiben'}
      </button>
    </div>
  {/if}

  {#if report}
    <p class="hint ok">
      {report.written} geschrieben, {report.skipped} übersprungen.
    </p>
    {#each report.errors as err}<p class="hint err">{err}</p>{/each}
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 999; }
  .dialog {
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(560px, 92vw); max-height: 84vh; overflow-y: auto;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 0 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.7rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); z-index: 1000;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center; user-select: none;
    margin: 0 -1.1rem 0.2rem; padding: 0.6rem 1.1rem; border-bottom: 1px solid var(--surface);
    position: sticky; top: 0; background: var(--bg);
  }
  .modal-title { font-weight: 700; font-size: 1rem; color: var(--ink); }
  .close-btn { background: none; border: none; color: var(--ink-muted); font-size: 1.3rem; cursor: pointer; line-height: 1; }
  .close-btn:hover { color: var(--ink); }

  .plan-list {
    border: 1px solid var(--border); border-radius: 5px;
    display: flex; flex-direction: column; padding: 0.3rem 0.5rem;
  }
  .plan-row {
    display: grid; grid-template-columns: 1fr 8rem 9rem; gap: 0.5rem;
    align-items: baseline; font-size: 0.82rem; padding: 0.12rem 0;
    color: var(--ink-muted);
  }
  .plan-row.pending { color: var(--ink); }
  .plan-row.failed { color: var(--danger); }
  .plan-name { font-weight: 600; }
  .plan-version { font-family: ui-monospace, monospace; font-size: 0.76rem; }
  .plan-steps { font-size: 0.76rem; }
  .step-list {
    margin: 0 0 0.25rem 0; padding-left: 1.2rem;
    font-size: 0.74rem; color: var(--ink-muted); list-style: '· ';
  }

  .actions { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
  .primary-btn {
    background: var(--red); border: none; border-radius: 4px; color: #fff;
    padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .hint { font-size: 0.78rem; margin: 0; color: var(--ink-muted); }
  .hint.ok { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }
</style>
