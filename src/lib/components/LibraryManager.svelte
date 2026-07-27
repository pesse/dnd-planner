<script lang="ts">
  import { onMount } from 'svelte';
  import {
    libraries,
    librariesLoading,
    installing,
    refreshLibraries,
    installMany,
    redeemAccessCode,
    forgetAccessCode,
    type Library,
  } from '../stores/libraries';

  let { onclose }: { onclose: () => void } = $props();

  /** Auswahl für die Installation, je Bibliotheks-id. */
  let selected = $state<Record<string, boolean>>({});
  /** Zugangscode-Eingabe je Bibliothek — erscheint, wenn eine gesperrte gewählt wird. */
  let codeInput = $state<Record<string, string>>({});
  /** id der Bibliothek, deren Code gerade geprüft wird. */
  let redeeming = $state<string | null>(null);

  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  let initialized = false;

  onMount(() => {
    refreshLibraries(false);
  });

  // Vorauswahl beim ersten Eintreffen der Liste: alles, was ohne weiteres Zutun
  // installiert oder aktualisiert werden kann. Gesperrtes bleibt ungewählt,
  // damit nicht sofort überall Code-Felder aufklappen.
  $effect(() => {
    const list = $libraries;
    if (initialized || !list.length) return;
    initialized = true;
    selected = Object.fromEntries(
      list.map((l) => [l.id, l.status === 'available' || l.status === 'update']),
    );
  });

  const STATE_LABEL: Record<Library['status'], string> = {
    installed: 'Installiert',
    update: 'Update verfügbar',
    available: 'Nicht installiert',
    locked: 'Zugangscode erforderlich',
    staleCode: 'Zugangscode veraltet',
  };

  const LICENSE_LABEL: Record<string, string> = {
    'CC-BY-4.0': 'SRD 5.2, frei weitergebbar',
    own: 'Eigene Inhalte',
    proprietary: 'Geschützt',
  };

  const kib = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KiB`;

  const needsCode = (lib: Library) => lib.status === 'locked' || lib.status === 'staleCode';

  let chosen = $derived($libraries.filter((l) => selected[l.id]));
  /** Gewählte Bibliotheken, die noch auf einen Zugangscode warten. */
  let blocked = $derived(chosen.filter(needsCode));
  let canInstall = $derived(!busy && chosen.length > 0 && blocked.length === 0);

  function toggleAll(on: boolean) {
    selected = Object.fromEntries($libraries.map((l) => [l.id, on]));
  }

  async function doRedeem(lib: Library) {
    const code = (codeInput[lib.id] ?? '').trim();
    if (!code) return;
    message = '';
    error = '';
    redeeming = lib.id;
    try {
      const unlocked = await redeemAccessCode(code);
      codeInput = { ...codeInput, [lib.id]: '' };
      message =
        unlocked.length === 1
          ? `Zugangscode gilt für „${unlocked[0]}“.`
          : `Zugangscode gilt für: ${unlocked.join(', ')}.`;
    } catch (e) {
      error = `${e}`;
    } finally {
      redeeming = null;
    }
  }

  function describe(r: Awaited<ReturnType<typeof installMany>>): string {
    const parts = [`${r.written} Datei(en) geschrieben`];
    if (r.removed) parts.push(`${r.removed} entfernt`);
    if (r.skippedModified) parts.push(`${r.skippedModified} lokal geändert, übersprungen`);
    return parts.join(', ');
  }

  function nameOf(id: string): string {
    return $libraries.find((l) => l.id === id)?.name ?? id;
  }

  async function doInstall() {
    message = '';
    error = '';
    busy = true;
    try {
      const ids = chosen.map((l) => l.id);
      let result = await installMany(ids);

      // Bestandsdateien: einmal für alle betroffenen Bibliotheken nachfragen,
      // statt pro Bibliothek einen eigenen Dialog zu zeigen.
      const adoptIds = Object.keys(result.needsAdopt);
      if (adoptIds.length) {
        const total = adoptIds.reduce((n, id) => n + result.needsAdopt[id], 0);
        const list = adoptIds.map((id) => `• ${nameOf(id)} (${result.needsAdopt[id]})`).join('\n');
        const ok = confirm(
          `${total} Datei(en) liegen bereits im Vault, stammen aber nicht aus der ` +
            `Bibliotheksverwaltung:\n\n${list}\n\n` +
            `Sollen sie durch die Fassung aus der Bibliothek ersetzt werden?`,
        );
        if (ok) {
          const second = await installMany(adoptIds, true);
          result = {
            written: result.written + second.written,
            skippedModified: result.skippedModified + second.skippedModified,
            removed: result.removed + second.removed,
            needsAdopt: {},
            failed: { ...result.failed, ...second.failed },
          };
        }
      }

      const failed = Object.keys(result.failed);
      if (failed.length) {
        error = failed.map((id) => `„${nameOf(id)}“: ${result.failed[id]}`).join(' · ');
      }
      message = describe(result);

      // Erledigtes abwählen, damit der Knopf zeigt, was noch offen ist.
      // Fehlgeschlagene bleiben gewählt, um sie erneut versuchen zu können.
      const done = new Set(
        $libraries.filter((l) => l.status === 'installed').map((l) => l.id),
      );
      selected = Object.fromEntries(
        Object.entries(selected).map(([id, on]) => [id, on && !done.has(id)]),
      );
    } finally {
      busy = false;
    }
  }

  async function doForget(lib: Library) {
    if (
      !confirm(
        `Zugangscode für „${lib.name}“ entfernen?\n\n` +
          `Bereits installierte Inhalte bleiben erhalten, es kommen aber keine ` +
          `Aktualisierungen mehr an.`,
      )
    )
      return;
    message = '';
    error = '';
    try {
      await forgetAccessCode(lib.id);
      message = `Zugangscode für „${lib.name}“ entfernt.`;
    } catch (e) {
      error = `${e}`;
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>

<div class="dialog" role="dialog" aria-label="Bibliotheken">
  <div class="modal-header">
    <span class="modal-title">Bibliotheken</span>
    <button class="close-btn" onclick={onclose} title="Schließen">×</button>
  </div>

  <p class="hint">
    Wähle, welche Bibliotheken installiert werden sollen. Deine Kampagnen und
    Charaktere bleiben unberührt.
  </p>

  {#if $librariesLoading && !$libraries.length}
    <p class="hint">Lade Bibliotheksverzeichnis…</p>
  {:else if !$libraries.length}
    <p class="hint err">
      Bibliotheksverzeichnis nicht erreichbar. Bereits installierte Inhalte bleiben
      natürlich nutzbar.
    </p>
  {:else}
    <div class="select-all">
      <button class="link-btn" onclick={() => toggleAll(true)}>Alle</button>
      <span class="sep">·</span>
      <button class="link-btn" onclick={() => toggleAll(false)}>Keine</button>
    </div>

    <ul class="lib-list">
      {#each $libraries as lib (lib.id)}
        <li class="lib" class:chosen={selected[lib.id]}>
          <label class="lib-row">
            <input type="checkbox" bind:checked={selected[lib.id]} disabled={busy} />
            <span class="lib-main">
              <span class="lib-title">
                {#if lib.protected}
                  <span class="lock" title={needsCode(lib) ? 'Zugangscode erforderlich' : 'Entsperrt'}>
                    {needsCode(lib) ? '🔒' : '🔓'}
                  </span>
                {/if}
                <span class="lib-name">{lib.name}</span>
                {#if $installing.has(lib.id)}<span class="spinner">…</span>{/if}
              </span>
              {#if lib.description}
                <span class="lib-desc">{lib.description}</span>
              {/if}
              <span class="lib-meta">
                {STATE_LABEL[lib.status]}
                · {lib.fileCount} Dateien · {kib(lib.size)}
                · {LICENSE_LABEL[lib.license] ?? lib.license}
                {#if lib.installedVersion && lib.status === 'update'}
                  · <code>{lib.installedVersion}</code> → <code>{lib.version}</code>
                {/if}
              </span>
            </span>
          </label>

          <!-- Code-Feld erscheint erst, wenn eine gesperrte Bibliothek gewählt wird. -->
          {#if selected[lib.id] && needsCode(lib)}
            <div class="code-row">
              <input
                class="code-input"
                type="text"
                placeholder="Zugangscode eingeben"
                bind:value={codeInput[lib.id]}
                onkeydown={(e) => e.key === 'Enter' && doRedeem(lib)}
                disabled={redeeming === lib.id}
              />
              <button
                class="secondary-btn"
                onclick={() => doRedeem(lib)}
                disabled={redeeming === lib.id || !(codeInput[lib.id] ?? '').trim()}
              >
                {redeeming === lib.id ? 'Prüfe…' : 'Einlösen'}
              </button>
            </div>
            {#if lib.status === 'staleCode'}
              <p class="hint small err">
                Der hinterlegte Code gehört zu einer älteren Fassung — bitte den neuen eingeben.
              </p>
            {/if}
          {/if}

          {#if lib.protected && !needsCode(lib)}
            <button class="link-btn forget" onclick={() => doForget(lib)}>
              Zugangscode entfernen
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="actions">
      {#if blocked.length}
        <span class="hint small err">
          {blocked.length === 1
            ? `Für „${blocked[0].name}“ fehlt der Zugangscode.`
            : `Für ${blocked.length} gewählte Bibliotheken fehlt der Zugangscode.`}
        </span>
      {/if}
      <button class="primary-btn" onclick={doInstall} disabled={!canInstall}>
        {busy ? 'Installiere…' : `Auswahl installieren (${chosen.length})`}
      </button>
    </div>
  {/if}

  {#if message}<p class="hint ok">{message}</p>{/if}
  {#if error}<p class="hint err">{error}</p>{/if}

  <p class="attribution">
    Die Grundbibliothek enthält Material aus dem System Reference Document 5.2 von
    Wizards of the Coast LLC, lizenziert unter
    <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">
      CC BY 4.0</a>.
  </p>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 999;
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(580px, 92vw);
    max-height: 84vh;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0 1.1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    margin: 0 -1.1rem 0.2rem;
    padding: 0.6rem 1.1rem;
    border-bottom: 1px solid var(--surface);
    position: sticky;
    top: 0;
    background: var(--bg);
  }
  .modal-title { font-weight: 700; font-size: 1rem; color: var(--ink); }
  .close-btn {
    background: none; border: none; color: var(--ink-muted);
    font-size: 1.3rem; cursor: pointer; line-height: 1;
  }
  .close-btn:hover { color: var(--ink); }

  .select-all { display: flex; gap: 0.4rem; align-items: center; font-size: 0.72rem; }
  .select-all .sep { color: var(--ink-muted); }

  .lib-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .lib {
    border: 1px solid var(--border); border-radius: 5px;
    padding: 0.55rem 0.7rem;
    display: flex; flex-direction: column; gap: 0.4rem;
  }
  .lib.chosen { border-color: var(--red); }

  .lib-row { display: flex; align-items: flex-start; gap: 0.55rem; cursor: pointer; }
  .lib-row input { accent-color: var(--red); cursor: pointer; margin-top: 0.2rem; flex-shrink: 0; }
  .lib-main { display: flex; flex-direction: column; min-width: 0; }
  .lib-title { display: flex; align-items: center; gap: 0.4rem; }
  .lib-name { font-size: 0.9rem; color: var(--ink); font-weight: 600; }
  .lock { font-size: 0.8rem; }
  .spinner { font-size: 0.8rem; color: var(--ink-muted); }
  .lib-desc { margin-top: 0.15rem; font-size: 0.78rem; color: var(--ink-soft); }
  .lib-meta { margin-top: 0.2rem; font-size: 0.72rem; color: var(--ink-muted); }
  .lib-meta code { font-size: 0.7rem; }

  .code-row { display: flex; gap: 0.4rem; align-items: center; padding-left: 1.35rem; }
  .code-input {
    flex: 1; min-width: 0;
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); padding: 0.3rem 0.5rem; font-family: inherit; font-size: 0.82rem;
  }

  .actions {
    display: flex; justify-content: flex-end; gap: 0.6rem; align-items: center;
    border-top: 1px solid var(--surface); padding-top: 0.6rem;
  }
  .primary-btn {
    background: var(--red); border: none; border-radius: 4px; color: #fff;
    padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink-soft); padding: 0.3rem 0.8rem; cursor: pointer;
    font-family: inherit; font-size: 0.82rem;
  }
  .secondary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .link-btn {
    background: none; border: none; color: var(--ink-muted);
    font-size: 0.7rem; cursor: pointer; padding: 0; text-decoration: underline;
  }
  .link-btn:hover { color: var(--ink-soft); }
  .link-btn.forget { align-self: flex-start; padding-left: 1.35rem; }

  .hint { font-size: 0.78rem; margin: 0; color: var(--ink-muted); }
  .hint.small { font-size: 0.7rem; }
  .hint.ok { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }

  .attribution {
    margin: 0; font-size: 0.68rem; color: var(--ink-muted);
    border-top: 1px solid var(--surface); padding-top: 0.5rem;
  }
  .attribution a { color: var(--ink-soft); }
</style>
