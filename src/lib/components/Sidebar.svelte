<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { activeCampaign, activeFile, fileContent } from '../stores/campaign';
  import type { FileEntry } from '../types';

  interface EntryInfo { name: string; is_dir: boolean; }

  const VAULT_BASE = './vault/campaigns';
  const CHARACTERS_PATH = './vault/characters';

  const campaigns = [
    { id: '1', name: 'Beispiel-Kampagne', path: 'beispiel-kampagne' }
  ];

  const sections: { label: string; subdir: string; type: FileEntry['type'] }[] = [
    { label: 'Sessions', subdir: 'sessions', type: 'session' },
    { label: 'NPCs', subdir: 'npcs', type: 'npc' },
    { label: 'Welt', subdir: 'world', type: 'world' },
  ];

  let expanded: Record<string, boolean> = $state({});
  let sectionFiles: Record<string, string[]> = $state({});
  let newFileInput: Record<string, string> = $state({});
  let showNewFileInput: Record<string, boolean> = $state({});

  // --- Charaktere (global) ---
  let charactersExpanded = $state(false);
  let characterEntries: EntryInfo[] = $state([]);
  let showNewCharInput = $state(false);
  let newCharInput = $state('');

  async function loadCharacters() {
    try {
      characterEntries = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
    } catch {
      characterEntries = [];
    }
  }

  async function toggleCharacters() {
    charactersExpanded = !charactersExpanded;
    if (charactersExpanded) await loadCharacters();
  }

  async function openCharacter(entry: EntryInfo) {
    if (entry.is_dir) {
      const dirPath = `${CHARACTERS_PATH}/${entry.name}`;
      activeFile.set({ name: entry.name, path: dirPath, type: 'character', dirPath });
      fileContent.set('');
    } else {
      const fullPath = `${CHARACTERS_PATH}/${entry.name}`;
      activeFile.set({ name: entry.name.replace('.md', ''), path: fullPath, type: 'character' });
      try {
        const content = await invoke<string>('read_file_content', { path: fullPath });
        fileContent.set(content);
      } catch (e) {
        fileContent.set(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
      }
    }
  }

  async function createCharacter(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = newCharInput.trim();
    if (!raw) return;

    const filename = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöü]/g, '') + '.md';
    const fullPath = `${CHARACTERS_PATH}/${filename}`;
    const title = raw.charAt(0).toUpperCase() + raw.slice(1);

    const template = `# ${title}

## Spieler


## Klasse & Level


## Hintergrund


## Attribute
| Attribut | Wert | Mod |
|----------|------|-----|
| STR | 10 | +0 |
| DEX | 10 | +0 |
| CON | 10 | +0 |
| INT | 10 | +0 |
| WIS | 10 | +0 |
| CHA | 10 | +0 |

**TP:** | **RK:** | **Initiative:**

## Fähigkeiten & Zauber


## Entscheidungen


## Notizen

`;
    try {
      await invoke('write_file_content', { path: fullPath, content: template });
      showNewCharInput = false;
      newCharInput = '';
      await loadCharacters();
      await openCharacter({ name: filename, is_dir: false });
    } catch (err) {
      console.error('Charakter konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewChar(e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewCharInput = false; newCharInput = ''; }
  }

  // --- Kampagnen ---
  async function loadSection(campaignPath: string, section: typeof sections[0]) {
    const key = `${campaignPath}/${section.subdir}`;
    try {
      sectionFiles[key] = await invoke<string[]>('list_directory', { path: `${VAULT_BASE}/${campaignPath}/${section.subdir}` });
    } catch {
      sectionFiles[key] = [];
    }
  }

  async function toggleSection(campaignPath: string, section: typeof sections[0]) {
    const key = `${campaignPath}/${section.subdir}`;
    expanded[key] = !expanded[key];
    if (expanded[key]) await loadSection(campaignPath, section);
  }

  async function openFile(campaignPath: string, section: typeof sections[0], filename: string) {
    const fullPath = `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;
    activeFile.set({ name: filename.replace('.md', ''), path: fullPath, type: section.type });
    try {
      const content = await invoke<string>('read_file_content', { path: fullPath });
      fileContent.set(content);
    } catch (e) {
      fileContent.set(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  }

  async function openCampaignFile(campaignPath: string) {
    const fullPath = `${VAULT_BASE}/${campaignPath}/campaign.md`;
    activeFile.set({ name: 'campaign', path: fullPath, type: 'campaign' });
    try {
      const content = await invoke<string>('read_file_content', { path: fullPath });
      fileContent.set(content);
    } catch (e) {
      fileContent.set(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  }

  function startNewFile(key: string) {
    showNewFileInput[key] = true;
    newFileInput[key] = '';
  }

  async function createFile(campaignPath: string, section: typeof sections[0], e: KeyboardEvent | MouseEvent) {
    const key = `${campaignPath}/${section.subdir}`;
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = newFileInput[key]?.trim();
    if (!raw) return;

    const filename = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöü]/g, '') + '.md';
    const fullPath = `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;
    const title = raw.charAt(0).toUpperCase() + raw.slice(1);

    try {
      const sectionTemplate = section.type === 'session'
        ? `# ${title}\n\n**Datum:**\n\n## Charaktere\n- \n\n## Was passierte\n\n## Wichtige Ereignisse\n\n## Nächste Sitzung\n\n`
        : `# ${title}\n\n`;
      await invoke('write_file_content', { path: fullPath, content: sectionTemplate });
      showNewFileInput[key] = false;
      newFileInput[key] = '';
      await loadSection(campaignPath, section);
      await openFile(campaignPath, section, filename);
    } catch (err) {
      console.error('Datei konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewFile(key: string, e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewFileInput[key] = false; newFileInput[key] = ''; }
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>DnD Planner</h2>
  </div>

  <!-- Charaktere (global) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleCharacters}>
        <span class="arrow" class:open={charactersExpanded}>›</span>
        Charaktere
      </button>
      <button class="add-btn" title="Neuer Charakter" onclick={() => { charactersExpanded = true; loadCharacters(); showNewCharInput = true; newCharInput = ''; }}>
        +
      </button>
    </div>

    {#if charactersExpanded}
      <div class="file-list">
        {#if characterEntries.length}
          {#each characterEntries as entry}
            <button
              class="file-entry"
              class:active={$activeFile?.path?.endsWith(entry.name)}
              onclick={() => openCharacter(entry)}
            >
              {entry.name.replace('.md', '')}
            </button>
          {/each}
        {:else if !showNewCharInput}
          <span class="empty">Keine Charaktere</span>
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

  <div class="divider"></div>

  <!-- Kampagnen -->
  {#each campaigns as campaign}
    <div class="campaign-section">
      <button
        class="campaign-title"
        class:active={$activeCampaign?.id === campaign.id}
        onclick={() => { activeCampaign.set({ ...campaign }); openCampaignFile(campaign.path); }}
      >
        {campaign.name}
      </button>

      {#if $activeCampaign?.id === campaign.id}
        {#each sections as section}
          {@const key = `${campaign.path}/${section.subdir}`}
          <div class="section">
            <div class="section-row">
              <button class="section-toggle" onclick={() => toggleSection(campaign.path, section)}>
                <span class="arrow" class:open={expanded[key]}>›</span>
                {section.label}
              </button>
              <button class="add-btn" title="Neue Datei" onclick={() => { expanded[key] = true; loadSection(campaign.path, section); startNewFile(key); }}>
                +
              </button>
            </div>

            {#if expanded[key]}
              <div class="file-list">
                {#if sectionFiles[key]?.length}
                  {#each sectionFiles[key] as filename}
                    <button
                      class="file-entry"
                      class:active={$activeFile?.path?.endsWith(filename)}
                      onclick={() => openFile(campaign.path, section, filename)}
                    >
                      {filename.replace('.md', '')}
                    </button>
                  {/each}
                {:else if !showNewFileInput[key]}
                  <span class="empty">Keine Dateien</span>
                {/if}

                {#if showNewFileInput[key]}
                  <div class="new-file-row">
                    <input
                      class="new-file-input"
                      bind:value={newFileInput[key]}
                      placeholder="Name…"
                      onkeydown={(e) => { createFile(campaign.path, section, e); cancelNewFile(key, e); }}
                      autofocus
                    />
                    <button class="confirm-btn" onclick={(e) => createFile(campaign.path, section, e)}>✓</button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/each}
</aside>

<style>
  .sidebar {
    width: 220px;
    min-height: 100vh;
    background: #1e1e2e;
    color: #cdd6f4;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #313244;
    flex-shrink: 0;
    overflow-y: auto;
  }

  .sidebar-header {
    padding: 1rem;
    border-bottom: 1px solid #313244;
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #cba6f7;
  }

  .top-section {
    padding: 0.5rem 0;
  }

  .divider {
    height: 1px;
    background: #313244;
    margin: 0.25rem 0;
  }

  .campaign-section {
    padding: 0.5rem 0;
  }

  .campaign-title {
    width: 100%;
    text-align: left;
    padding: 0.4rem 1rem;
    background: none;
    border: none;
    color: #cdd6f4;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .campaign-title:hover,
  .campaign-title.active {
    background: #313244;
    color: #cba6f7;
  }

  .section {
    padding: 0 0 0.25rem 0;
  }

  .section-row {
    display: flex;
    align-items: center;
  }

  .section-toggle {
    flex: 1;
    text-align: left;
    padding: 0.25rem 0.5rem 0.25rem 1.5rem;
    background: none;
    border: none;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .chars-toggle {
    padding-left: 1rem;
  }

  .section-toggle:hover {
    color: #cdd6f4;
  }

  .add-btn {
    padding: 0 0.6rem;
    background: none;
    border: none;
    color: #6c7086;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .section-row:hover .add-btn {
    opacity: 1;
  }

  .add-btn:hover {
    color: #cba6f7;
  }

  .arrow {
    display: inline-block;
    transition: transform 0.15s;
    font-size: 1rem;
    line-height: 1;
  }

  .arrow.open {
    transform: rotate(90deg);
  }

  .file-list {
    display: flex;
    flex-direction: column;
  }

  .file-entry {
    width: 100%;
    text-align: left;
    padding: 0.25rem 1rem 0.25rem 2.5rem;
    background: none;
    border: none;
    color: #a6adc8;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-entry:hover {
    background: #313244;
    color: #cdd6f4;
  }

  .file-entry.active {
    background: #45475a;
    color: #cba6f7;
  }

  .empty {
    padding: 0.2rem 1rem 0.2rem 2.5rem;
    font-size: 0.8rem;
    color: #45475a;
    font-style: italic;
  }

  .new-file-row {
    display: flex;
    align-items: center;
    padding: 0.25rem 0.5rem 0.25rem 2rem;
    gap: 0.25rem;
  }

  .new-file-input {
    flex: 1;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 4px;
    color: #cdd6f4;
    padding: 0.2rem 0.4rem;
    font-size: 0.85rem;
    outline: none;
    min-width: 0;
  }

  .new-file-input:focus {
    border-color: #cba6f7;
  }

  .confirm-btn {
    background: none;
    border: none;
    color: #a6e3a1;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0 0.2rem;
  }
</style>
