<script lang="ts">
  import { activeCampaign } from '../stores/campaign';
  import type { Encounter } from '../types';
  import MonsterMiniCard from './MonsterMiniCard.svelte';
  import EncounterHeader from './encounter/EncounterHeader.svelte';
  import EncounterMonsterSection from './encounter/EncounterMonsterSection.svelte';
  import ParseError from './ui/ParseError.svelte';
  import { printEncounter } from '../services/encounterPrint';
  import { loadEncounterMonsters } from '../stores/context';
  import { parseEncounter, jsonParser } from '../utils/schemaValidation';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import './encounter/encounterCard.css';

  let actMonsterBasePath = $state<string | undefined>(undefined);
  let showJson = $state(false);
  let rawJson = $state('');
  let jsonError = $state('');

  const ed = createCardEditor<Encounter>({
    type: 'encounter',
    label: 'Encounter',
    parse: jsonParser(parseEncounter),
    onLoad: (content, path) => {
      const match = path.match(/^(.*\/acts\/[^/]+)\/encounters\//);
      actMonsterBasePath = match ? `${match[1]}/monsters` : undefined;
      loadEncounterMonsters(content, path);
    },
  });

  let draft = $derived(ed.draft);
  let dirty = $derived(ed.dirty);
  let saveError = $derived(ed.saveError);

  function openJson() { rawJson = JSON.stringify(draft, null, 2); jsonError = ''; showJson = true; }

  async function saveJson() {
    try {
      JSON.parse(rawJson);   // Validierung
      jsonError = '';
      await ed.saveJson(rawJson);
      showJson = false;
    } catch (e) {
      jsonError = `Ungültiges JSON: ${e}`;
    }
  }

  let printLoading = $state(false);
  let printError = $state('');

  async function openPrint() {
    if (!draft) return;
    printLoading = true;
    saveError = '';
    printError = '';
    try {
      await printEncounter(draft, actMonsterBasePath, $activeCampaign?.name);
    } catch (e) {
      printError = `Druckfehler: ${e}`;
    }
    printLoading = false;
  }
</script>

<div class="encounter-panel">
  {#if showJson}
    <div class="json-editor">
      <div class="json-toolbar">
        <span class="json-label">JSON bearbeiten</span>
        {#if jsonError}<span class="json-error">{jsonError}</span>{/if}
        <button class="save-btn" onclick={saveJson}>Speichern</button>
        <button class="cancel-btn" onclick={() => showJson = false}>Abbrechen</button>
      </div>
      <textarea class="json-textarea" bind:value={rawJson} spellcheck="false"></textarea>
    </div>
  {:else if draft}
    <div class="enc-layout">
      <div class="enc-main-col">
        {#if dirty}
          <div class="save-bar">
            {#if saveError}<span class="save-error">{saveError}</span>{/if}
            <button class="save-btn" onclick={() => ed.save()}>Speichern</button>
            <button class="cancel-btn" onclick={() => ed.discard()}>Verwerfen</button>
          </div>
        {/if}

        <div class="enc-card">
          <EncounterHeader encounter={draft} />

          <textarea
            class="editable-field enc-desc-input"
            bind:value={draft.description}
            placeholder="Beschreibung…"
            rows="5"
          ></textarea>

          <div class="read-aloud-section">
            <h3 class="enc-section-title read-aloud-title">Vorlesetext</h3>
            <textarea
              class="editable-field enc-read-aloud-input"
              bind:value={draft.read_aloud}
              placeholder="Atmosphärischer Text zum Vorlesen…"
              rows="3"
            ></textarea>
          </div>

          <div class="enc-meta">
            <div class="enc-meta-item">
              <span class="meta-label">Ort</span>
              <input class="editable-field meta-input" bind:value={draft.location} placeholder="—" />
            </div>
            <div class="enc-meta-item">
              <span class="meta-label">Gruppe</span>
              <input class="editable-field meta-num-input" type="number" bind:value={draft.party_size} />
              <span class="meta-sep">× Lvl</span>
              <input class="editable-field meta-num-input" type="number" bind:value={draft.party_level} />
            </div>
            <div class="enc-meta-item">
              <span class="meta-label">Gesamt-EP</span>
              <input class="editable-field meta-num-input meta-xp" type="number" bind:value={draft.xp_total} />
              <span class="meta-sep">XP</span>
            </div>
          </div>

          <div class="enc-divider"></div>

          <EncounterMonsterSection encounter={draft} />

          <div class="enc-divider"></div>

          <h3 class="enc-section-title">Beute</h3>
          <textarea class="editable-field enc-text-input" bind:value={draft.loot} placeholder="Beute…" rows="2"></textarea>

          <div class="enc-divider"></div>

          <h3 class="enc-section-title">Notizen</h3>
          <textarea
            class="editable-field enc-text-input enc-notes-input"
            bind:value={draft.notes}
            placeholder="Notizen…"
            rows="4"
          ></textarea>

          <div class="enc-footer">
            {#if printError}<span class="print-error">{printError}</span>{/if}
            <button class="json-btn" onclick={openJson}>JSON</button>
            <button class="print-btn" onclick={openPrint} disabled={printLoading}>
              {printLoading ? '…' : '🖨 PDF'}
            </button>
          </div>
        </div>
      </div>

      {#if draft.monsters.some(m => m.slug)}
        <div class="enc-monsters-col">
          {#each draft.monsters as m, i (i)}
            {#if m.slug}
              <div class="mini-card-wrap">
                {#if m.count > 1}
                  <div class="mini-count-badge">{m.count}×</div>
                {/if}
                <MonsterMiniCard slug={m.slug} {actMonsterBasePath} />
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <ParseError message="Ungültiges Encounter-JSON." onjson={openJson} />
  {/if}
</div>

<style>
  .encounter-panel {
    flex: 1;
    overflow: auto;
    padding: 1.5rem;
    background: var(--bg);
  }

  .enc-layout {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 1rem;
    min-width: max-content;
  }

  .enc-main-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 620px;
    flex-shrink: 0;
  }

  .enc-monsters-col {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .mini-card-wrap { position: relative; }

  .mini-count-badge {
    position: absolute;
    top: -0.4rem;
    left: -0.4rem;
    background: var(--gold);
    color: var(--bg);
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 10px;
    padding: 0.05rem 0.3rem;
    z-index: 1;
    line-height: 1.4;
  }

  .save-bar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    background: var(--bg-raised);
    border: 1px solid var(--steel);
    border-radius: 4px;
    padding: 0.4rem 0.75rem;
    width: 100%;
    max-width: 620px;
  }

  .save-error { flex: 1; color: var(--danger); font-size: 0.8rem; }

  .enc-card {
    background: var(--bg-raised);
    border: 1px solid var(--steel);
    border-radius: 6px;
    padding: 1.25rem;
    max-width: 620px;
    width: 100%;
    color: var(--ink);
    font-size: 0.88rem;
  }

  .read-aloud-section {
    border-left: 3px solid var(--arcane);
    padding-left: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .enc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.82rem;
  }

  .enc-meta-item {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
  }

  .meta-label { font-weight: 700; color: var(--steel); white-space: nowrap; }
  .meta-sep { color: var(--ink-soft); }

  .enc-divider {
    height: 1px;
    background: var(--steel);
    margin: 0.75rem 0;
  }

  .enc-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid color-mix(in srgb, var(--steel) 20%, transparent);
  }

  .json-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--border);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .json-btn:hover { border-color: var(--ink-muted); color: var(--ink-muted); }

  .print-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .print-btn:hover { border-color: var(--red); color: var(--red); }
  .print-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .print-error { color: var(--danger); font-size: 0.75rem; flex: 1; }

  .json-editor { display: flex; flex-direction: column; width: 100%; max-width: 700px; gap: 0.5rem; }
  .json-toolbar { display: flex; align-items: center; gap: 0.5rem; }
  .json-label { flex: 1; font-size: 0.85rem; color: var(--ink-muted); }
  .json-error { color: var(--danger); font-size: 0.8rem; }
  .save-btn { background: var(--green); color: var(--bg); border: none; border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
  .cancel-btn { background: transparent; border: 1px solid var(--border); color: var(--ink-muted); border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; }
  .json-textarea { flex: 1; min-height: 500px; background: var(--bg-panel); border: 1px solid var(--surface); border-radius: 4px; color: var(--ink); font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; padding: 1rem; outline: none; resize: vertical; line-height: 1.6; }
</style>
