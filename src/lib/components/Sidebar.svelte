<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { untrack } from 'svelte';
  import DragonMark from './DragonMark.svelte';
  import VaultTransferModal from './VaultTransferModal.svelte';
  import LibraryManager from './LibraryManager.svelte';
  import CreateCardModal from './CreateCardModal.svelte';
  import CharacterWizard from './CharacterWizard.svelte';
  import CampaignTree from './sidebar/CampaignTree.svelte';
  import GroupedSectionView from './sidebar/GroupedSection.svelte';
  import SectionHeader from './sidebar/SectionHeader.svelte';
  import SidebarSection from './sidebar/SidebarSection.svelte';
  import { activeFile, setFileContent } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import { updateState, updateDialogOpen } from '../stores/update';
  import { libraries, libraryManagerOpen, updateCount } from '../stores/libraries';
  import { deleteEntry } from '../services/sidebar/deleteEntry';
  import { LIBRARY_SECTIONS } from '../services/sidebar/librarySections';
  import { GROUPED_SECTIONS } from '../services/sidebar/groupedSections';
  import { CREATE_SPECS, type CreateKind } from '../services/sidebar/createSpecs';
  import { ensureCharacterJson } from '../pdf/characterImport';
  import {
    CHARACTERS_PATH,
    createBlankCharacter,
    createWizardCharacter,
    importCharacterFromPdf,
  } from '../services/characterCreate';
  import type { Character } from '../schemas/characterSchema';
  import './sidebar/tree.css';

  interface EntryInfo { name: string; is_dir: boolean; }

  /** Welcher „Neues X"-Dialog offen ist. */
  let createModal = $state<CreateKind | null>(null);
  let showTransferModal = $state(false);
  /** Anzahl Bibliotheken mit Update — hebt den Bibliotheks-Knopf hervor. */
  let libUpdates = $derived(updateCount($libraries));

  type Reloadable = { reload: () => Promise<void> };
  let globalSections: (Reloadable | undefined)[] = $state([]);
  let campaignTree: Reloadable | undefined = $state();

  async function reloadAll() {
    await campaignTree?.reload();
    if (charactersExpanded) await loadCharacters();
    for (const section of globalSections) await section?.reload();
  }

  let charactersExpanded = $state(false);
  let characterEntries: EntryInfo[] = $state([]);
  // Anzeige-Meta je Charakter-Eintrag (dir-name → Name, Klassen-Icon, Klasse, Level).
  type CharClass = { icon: string; label: string; level: number | null };
  let characterMeta: Record<string, { name: string; classes: CharClass[] }> = $state({});

  // Deutsche Klassennamen → Icon + Label. Erkennung per Substring in classLevel
  // (ASCII-Schreibweisen zeigen auf dasselbe Label).
  const CLASS_INFO: Record<string, { icon: string; label: string }> = {
    barbar: { icon: '🪓', label: 'Barbar' },
    barde: { icon: '🎶', label: 'Barde' },
    druide: { icon: '🌿', label: 'Druide' },
    erfinder: { icon: '⚙️', label: 'Erfinder' },
    hexenmeister: { icon: '👁️', label: 'Hexenmeister' },
    kämpfer: { icon: '⚔️', label: 'Kämpfer' },
    kampfer: { icon: '⚔️', label: 'Kämpfer' },
    kleriker: { icon: '🙏', label: 'Kleriker' },
    magier: { icon: '🔮', label: 'Magier' },
    mönch: { icon: '👊', label: 'Mönch' },
    monch: { icon: '👊', label: 'Mönch' },
    paladin: { icon: '🛡️', label: 'Paladin' },
    schurke: { icon: '🗡️', label: 'Schurke' },
    waldläufer: { icon: '🏹', label: 'Waldläufer' },
    waldlaufer: { icon: '🏹', label: 'Waldläufer' },
    zauberer: { icon: '✨', label: 'Zauberer' },
  };
  function classLevelInfo(classLevel: string): { icon: string; label: string } {
    const lc = classLevel.toLowerCase();
    for (const [name, info] of Object.entries(CLASS_INFO)) {
      if (lc.includes(name)) return info;
    }
    return { icon: '👤', label: classLevel || 'Unbekannte Klasse' };
  }
  // Zerlegt einen classLevel-String in einzelne Klassen (Multiclassing), z. B.
  // "Magier 5 / Zauberer 3" → zwei Einträge mit je Icon + Level.
  function parseClasses(classLevel: string): CharClass[] {
    const segments = classLevel
      .split(/[/,&+]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!segments.length) {
      const info = classLevelInfo('');
      return [{ icon: info.icon, label: info.label, level: null }];
    }
    return segments.map((seg) => {
      const info = classLevelInfo(seg);
      const levelMatch = seg.match(/\d+/);
      return { icon: info.icon, label: info.label, level: levelMatch ? Number(levelMatch[0]) : null };
    });
  }
  let showNewCharInput = $state(false);
  let newCharInput = $state('');
  let showWizard = $state(false);
  let pdfImporting = $state(false);
  let pdfImportError = $state('');

  async function loadCharacters() {
    try {
      characterEntries = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
    } catch {
      characterEntries = [];
    }
    // Name + Klassen (inkl. Multiclassing) aus der character.json je Verzeichnis nachladen.
    const meta: Record<string, { name: string; classes: CharClass[] }> = {};
    await Promise.all(
      characterEntries
        .filter((e) => e.is_dir)
        .map(async (e) => {
          try {
            const content = await invoke<string>('read_file_content', { path: `${CHARACTERS_PATH}/${e.name}/character.json` });
            const data = JSON.parse(content);
            const classLevel: string = data.classLevel?.trim() ?? '';
            meta[e.name] = {
              name: data.name?.trim() || e.name,
              classes: parseClasses(classLevel),
            };
          } catch {
            // kein/ungültiges JSON → Fallback auf Verzeichnisnamen im Template
          }
        })
    );
    characterMeta = meta;
  }

  async function toggleCharacters() {
    charactersExpanded = !charactersExpanded;
    if (charactersExpanded) await loadCharacters();
  }

  // Ein Charakter wird von außen geöffnet (z.B. Link-Navigation) → Sektion aufklappen.
  // untrack verhindert ein Re-Expandieren, wenn der Nutzer manuell zuklappt.
  $effect(() => {
    const path = $activeFile?.path;
    if (!path?.startsWith(`${CHARACTERS_PATH}/`)) return;
    untrack(() => {
      if (!charactersExpanded) { charactersExpanded = true; loadCharacters(); }
    });
  });

  async function openCharacter(entry: EntryInfo) {
    if (!(await confirmNavigation())) return;
    if (entry.is_dir) {
      const dirPath = `${CHARACTERS_PATH}/${entry.name}`;
      // PDF ist reine Import-Quelle: fehlt die character.json, einmalig aus PDF anlegen.
      await ensureCharacterJson(dirPath);
      activeFile.set({ name: entry.name, path: `${dirPath}/character.json`, type: 'character', dirPath });
      setFileContent('');
    } else {
      const fullPath = `${CHARACTERS_PATH}/${entry.name}`;
      activeFile.set({ name: entry.name.replace('.md', ''), path: fullPath, type: 'character' });
      try {
        const content = await invoke<string>('read_file_content', { path: fullPath });
        setFileContent(content);
      } catch (e) {
        setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
      }
    }
  }

  async function createCharacter(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const slug = await createBlankCharacter(newCharInput);
    if (!slug) return;
    showNewCharInput = false;
    newCharInput = '';
    await loadCharacters();
    await openCharacter({ name: slug, is_dir: true });
  }

  function cancelNewChar(e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewCharInput = false; newCharInput = ''; }
  }

  async function createFromWizard(character: Character) {
    const slug = await createWizardCharacter(character);
    if (!slug) return;
    showWizard = false;
    charactersExpanded = true;
    await loadCharacters();
    await openCharacter({ name: slug, is_dir: true });
  }

  async function importFromPdf() {
    pdfImportError = '';
    const result = await importCharacterFromPdf(() => (pdfImporting = true));
    pdfImporting = false;
    if (result.status === 'error') pdfImportError = result.message;
    if (result.status !== 'ok') return;
    charactersExpanded = true;
    await loadCharacters();
    await openCharacter({ name: result.slug, is_dir: true });
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header ornament-top">
    <h2><DragonMark size={18} /> DnD Planner</h2>
    <div class="header-actions">
      {#if $updateState.status === 'available'}
        <button
          class="header-btn update-btn"
          title={`Update auf v${$updateState.version} verfügbar`}
          onclick={() => updateDialogOpen.set(true)}
        >⬆</button>
      {/if}
      <button
        class="header-btn"
        class:library-update={libUpdates > 0}
        title={libUpdates > 0
          ? `${libUpdates} Bibliotheks-Update(s) verfügbar`
          : 'Bibliotheken verwalten'}
        onclick={() => libraryManagerOpen.set(true)}
      >📚</button>
      <button class="header-btn" title="Vault importieren / exportieren" onclick={() => (showTransferModal = true)}>⇅</button>
      <button class="reload-all-btn" title="Alles neu laden" onclick={reloadAll}>↺</button>
    </div>
  </div>

  <div class="top-section">
    <SectionHeader label="Charaktere" expanded={charactersExpanded} ontoggle={toggleCharacters} top>
      {#snippet actions()}
        <button class="add-btn" title="Aus PDF importieren" disabled={pdfImporting} onclick={() => { importFromPdf(); }}>
          {pdfImporting ? '…' : 'PDF'}
        </button>
        <button class="add-btn" title="Neuer Charakter" onclick={() => { showWizard = true; }}>
          +
        </button>
      {/snippet}
    </SectionHeader>

    {#if charactersExpanded}
      <div class="file-list">
        {#if characterEntries.length}
          {#each characterEntries as entry}
            {@const meta = characterMeta[entry.name]}
            <div class="entry-row">
              <button
                class="file-entry"
                class:char-entry={!!meta}
                class:active={$activeFile?.path?.endsWith(entry.name)}
                onclick={() => openCharacter(entry)}
              >
                {#if meta}
                  <span class="char-classes">
                    {#each meta.classes as cls}
                      <span class="char-class-icon" title="{cls.label}{cls.level !== null ? ` ${cls.level}` : ''}">
                        {cls.icon}
                        {#if cls.level !== null}<span class="char-level-badge">{cls.level}</span>{/if}
                      </span>
                    {/each}
                  </span>
                  {meta.name}
                {:else}
                  {entry.name.replace('.md', '')}
                {/if}
              </button>
              <button
                class="entry-del"
                title="Löschen"
                onclick={(e) => { e.stopPropagation(); deleteEntry(`${CHARACTERS_PATH}/${entry.name}`, entry.name.replace('.md', ''), entry.is_dir, loadCharacters); }}
              >🗑</button>
            </div>
          {/each}
        {:else if !showNewCharInput}
          <span class="empty">Keine Charaktere</span>
        {/if}

        {#if pdfImportError}
          <span class="pdf-error">{pdfImportError}</span>
        {/if}

        {#if showNewCharInput}
          <div class="new-file-row">
            <input
              class="new-file-input"
              bind:value={newCharInput}
              placeholder="Name…"
              onkeydown={(e) => { createCharacter(e); cancelNewChar(e); }}
              autofocus
            />
            <button class="confirm-btn" onclick={(e) => createCharacter(e)}>✓</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#each GROUPED_SECTIONS as section, i}
    <GroupedSectionView
      {section}
      oncreate={() => (createModal = section.kind)}
      bind:this={globalSections[i]}
    />
  {/each}

  {#each LIBRARY_SECTIONS as section, i}
    <SidebarSection
      {section}
      oncreate={() => (createModal = section.kind)}
      bind:this={globalSections[GROUPED_SECTIONS.length + i]}
    />
  {/each}

  {#if $libraryManagerOpen}
    <LibraryManager onclose={() => libraryManagerOpen.set(false)} />
  {/if}

  {#if showTransferModal}
    <VaultTransferModal onclose={() => (showTransferModal = false)} />
  {/if}

  {#if showWizard}
    <CharacterWizard onComplete={createFromWizard} onCancel={() => (showWizard = false)} />
  {/if}

  {#if createModal}
    <CreateCardModal {...CREATE_SPECS[createModal]} onclose={() => (createModal = null)} />
  {/if}

  <div class="divider"></div>

  <CampaignTree bind:this={campaignTree} />
</aside>

<style>
  .sidebar {
    width: 100%;
    height: 100%;
    background: var(--bg);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--surface);
    flex-shrink: 0;
    overflow-y: auto;
  }

  .sidebar-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    align-items: center;
  }

  .sidebar-header h2 {
    margin: 0;
    flex: 1;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--red);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .sidebar-header h2 :global(.dragon-mark) {
    color: var(--red);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }

  .reload-all-btn,
  .header-btn {
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.1rem 0.3rem;
    line-height: 1;
    opacity: 0.5;
    transition: opacity 0.1s, color 0.1s;
  }

  .sidebar-header:hover .reload-all-btn,
  .sidebar-header:hover .header-btn {
    opacity: 1;
  }

  .reload-all-btn:hover,
  .header-btn:hover {
    color: var(--arcane);
  }

  /* Update-Hinweis: dauerhaft sichtbar + hervorgehoben, nicht nur bei Hover. */
  .update-btn {
    opacity: 1;
    color: var(--gold);
  }
  .sidebar-header .update-btn { opacity: 1; }
  .update-btn:hover { color: var(--gold); filter: brightness(1.2); }

  /* Bibliotheks-Update: gleiche Logik wie beim App-Update — dauerhaft
     sichtbar, sobald es etwas zu holen gibt. */
  .header-btn.library-update { color: var(--gold); opacity: 1; }
  .header-btn.library-update:hover { filter: brightness(1.2); }

  .divider {
    height: 1px;
    background: var(--surface);
    margin: 0.25rem 0;
  }

  /* Klassen-Icon + Level-Badge vor Charakter-Einträgen */
  .char-classes {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-right: 0.45rem;
    vertical-align: middle;
  }
  .char-class-icon {
    position: relative;
    display: inline-block;
    font-size: 0.9rem;
    line-height: 1;
  }
  /* Level klein, halb über dem Klassen-Icon (oben rechts) – erlaubt mehrere Klassen nebeneinander */
  .char-level-badge {
    position: absolute;
    top: -0.45em;
    right: -0.4em;
    min-width: 0.7rem;
    padding: 0 0.12rem;
    border-radius: 0.55rem;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: var(--ink-soft);
    font-size: 0.5rem;
    font-weight: 600;
    text-align: center;
    line-height: 0.72rem;
  }

  .pdf-error {
    width: 100%;
    font-size: 0.72rem;
    color: var(--danger);
    padding-left: 0.1rem;
  }
</style>
