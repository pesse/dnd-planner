<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './ui/Modal.svelte';
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
  import { confirmAction } from '../stores/confirmDialog';

  let { onclose }: { onclose: () => void } = $props();

  let selected = $state<Record<string, boolean>>({});
  let codeInput = $state<Record<string, string>>({});
  let redeeming = $state<string | null>(null);

  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  let initialized = false;

  onMount(() => {
    refreshLibraries(false);
  });

  // Gesperrtes bleibt ungewählt, damit nicht sofort überall Code-Felder aufklappen.
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
    appOutdated: 'App-Update erforderlich',
  };

  const LICENSE_LABEL: Record<string, string> = {
    'CC-BY-4.0': 'SRD 5.2, frei weitergebbar',
    own: 'Eigene Inhalte',
    proprietary: 'Geschützt',
  };

  const kib = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KiB`;

  const needsCode = (lib: Library) => lib.status === 'locked' || lib.status === 'staleCode';

  const needsAppUpdate = (lib: Library) => lib.status === 'appOutdated';

  // Bei `appOutdated` verdeckt die Versionssperre, ob ein Code hinterlegt ist — das
  // Schloss bleibt dann zu, statt „entsperrt" zu behaupten.
  const locked = (lib: Library) => needsCode(lib) || needsAppUpdate(lib);
  const lockTitle = (lib: Library) =>
    needsAppUpdate(lib)
      ? 'App-Update erforderlich'
      : needsCode(lib)
        ? 'Zugangscode erforderlich'
        : 'Entsperrt';

  let chosen = $derived($libraries.filter((l) => selected[l.id]));
  let blocked = $derived(chosen.filter(needsCode));
  let canInstall = $derived(!busy && chosen.length > 0 && blocked.length === 0);

  function toggleAll(on: boolean) {
    selected = Object.fromEntries($libraries.map((l) => [l.id, on && !needsAppUpdate(l)]));
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

      // Einmal für alle betroffenen Bibliotheken fragen, nicht pro Bibliothek.
      const adoptIds = Object.keys(result.needsAdopt);
      if (adoptIds.length) {
        const total = adoptIds.reduce((n, id) => n + result.needsAdopt[id], 0);
        const list = adoptIds.map((id) => `• ${nameOf(id)} (${result.needsAdopt[id]})`).join('\n');
        const ok = await confirmAction({
          title: 'Bestandsdateien ersetzen?',
          message:
            `${total} Datei(en) liegen bereits im Vault, stammen aber nicht aus der ` +
            `Bibliotheksverwaltung:\n\n${list}\n\n` +
            `Sollen sie durch die Fassung aus der Bibliothek ersetzt werden?`,
          confirmLabel: 'Ersetzen',
          danger: true,
        });
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

      // Erledigtes abwählen, Fehlgeschlagenes bleibt gewählt — der Knopf zeigt so, was
      // noch offen ist.
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
    const ok = await confirmAction({
      title: `Zugangscode für „${lib.name}“ entfernen?`,
      message:
        `Bereits installierte Inhalte bleiben erhalten, es kommen aber keine ` +
        `Aktualisierungen mehr an.`,
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!ok) return;
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

<Modal title="Bibliotheken" draggable={false} width="min(580px, 92vw)" {onclose}>
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
            <input
              type="checkbox"
              bind:checked={selected[lib.id]}
              disabled={busy || needsAppUpdate(lib)}
            />
            <span class="lib-main">
              <span class="lib-title">
                {#if lib.protected}
                  <span class="lock" title={lockTitle(lib)}>{locked(lib) ? '🔒' : '🔓'}</span>
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

          {#if needsAppUpdate(lib)}
            <p class="hint small err">
              Diese Fassung setzt Version {lib.minVersion} oder neuer voraus — bitte die
              App aktualisieren. Bereits installierte Inhalte bleiben nutzbar.
            </p>
          {/if}

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

          {#if lib.protected && !locked(lib)}
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
</Modal>

<style>
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
  .secondary-btn { padding: 0.3rem 0.8rem; font-size: 0.82rem; }
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
