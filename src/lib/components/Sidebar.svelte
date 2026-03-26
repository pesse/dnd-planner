<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import { activeCampaign, activeFile, fileContent, setFileContent, vaultVersion } from '../stores/campaign';
  import { loadActSummaries } from '../stores/context';
  import type { Campaign, FileEntry } from '../types';
  import { MONSTER_TEMPLATE as monsterTemplate } from '../types';

  interface EntryInfo { name: string; is_dir: boolean; }

  const VAULT_BASE = './vault/campaigns';
  const CHARACTERS_PATH = './vault/characters';
  const MONSTERS_PATH = './vault/monsters';

  const sections: { label: string; subdir: string; type: FileEntry['type'] }[] = [
    { label: 'Akte', subdir: 'acts', type: 'act' },
    { label: 'Sessions', subdir: 'sessions', type: 'session' },
    { label: 'NPCs', subdir: 'npcs', type: 'npc' },
    { label: 'Welt', subdir: 'world', type: 'world' },
  ];

  let campaigns = $state<Campaign[]>([]);
  let showNewCampaignInput = $state(false);
  let newCampaignInput = $state('');

  let expanded: Record<string, boolean> = $state({});
  let sectionFiles: Record<string, string[]> = $state({});
  /** Maps full vault path → extracted document title (# Heading) */
  let fileTitles: Record<string, string> = $state({});
  let newFileInput: Record<string, string> = $state({});
  let showNewFileInput: Record<string, boolean> = $state({});

  function slugify(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöüß]/g, '');
  }

  function slugToName(slug: string): string {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async function loadCampaigns() {
    try {
      const entries = await invoke<EntryInfo[]>('list_entries', { path: VAULT_BASE });
      campaigns = entries
        .filter((e) => e.is_dir)
        .map((e, i) => ({ id: String(i), name: slugToName(e.name), path: e.name }));
    } catch {
      campaigns = [];
    }
  }

  async function createCampaign(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = newCampaignInput.trim();
    if (!raw) return;

    const slug = slugify(raw);
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const campaignMd = `${VAULT_BASE}/${slug}/campaign.md`;

    const template = `# ${name}

## Beschreibung


## Hintergrund


## Hauptziele


## Wichtige Orte


## Notizen

`;
    try {
      await invoke('write_file_content', { path: campaignMd, content: template });
      showNewCampaignInput = false;
      newCampaignInput = '';
      await loadCampaigns();
      // Neue Kampagne gleich öffnen
      const newCampaign = campaigns.find((c) => c.path === slug);
      if (newCampaign) {
        activeCampaign.set(newCampaign);
        activeFile.set({ name: 'campaign', path: campaignMd, type: 'campaign' });
        setFileContent(template);
      }
    } catch (err) {
      console.error('Kampagne konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewCampaign(e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewCampaignInput = false; newCampaignInput = ''; }
  }

  onMount(loadCampaigns);

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

  // --- Monster (global) ---
  let monstersExpanded = $state(false);
  let monsterFiles = $state<string[]>([]);
  let monsterNames: Record<string, string> = $state({});
  let showNewMonsterInput = $state(false);
  let newMonsterInput = $state('');

  async function loadMonsters() {
    try {
      monsterFiles = await invoke<string[]>('list_json_files', { path: MONSTERS_PATH });
      monsterFiles.forEach(async (filename) => {
        const path = `${MONSTERS_PATH}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          monsterNames[filename] = data.name ?? filename.replace('.json', '');
        } catch {
          monsterNames[filename] = filename.replace('.json', '');
        }
      });
    } catch {
      monsterFiles = [];
    }
  }

  async function toggleMonsters() {
    monstersExpanded = !monstersExpanded;
    if (monstersExpanded) await loadMonsters();
  }

  async function openMonster(filename: string) {
    const path = `${MONSTERS_PATH}/${filename}`;
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'monster' });
    try {
      const content = await invoke<string>('read_file_content', { path });
      setFileContent(content);
    } catch (e) {
      setFileContent('{}');
    }
  }

  async function createMonster(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = newMonsterInput.trim();
    if (!raw) return;

    const slug = slugify(raw);
    const filename = slug + '.json';
    const path = `${MONSTERS_PATH}/${filename}`;
    const template = { ...monsterTemplate, name: raw.charAt(0).toUpperCase() + raw.slice(1) };

    try {
      await invoke('write_file_content', { path, content: JSON.stringify(template, null, 2) });
      showNewMonsterInput = false;
      newMonsterInput = '';
      await loadMonsters();
      await openMonster(filename);
    } catch (err) {
      console.error('Monster konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewMonster(e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewMonsterInput = false; newMonsterInput = ''; }
  }

  // --- Encounter (pro Kampagne, als Unterpunkt von Akten) ---
  const ENCOUNTERS_SUBDIR = 'encounters';
  let encounterFiles: Record<string, string[]> = $state({});
  let encounterNames: Record<string, string> = $state({});
  let encounterTags: Record<string, string[]> = $state({});
  let showNewActEncounterInput: Record<string, boolean> = $state({});
  let newActEncounterInput: Record<string, string> = $state({});

  function getActKey(filename: string): string {
    const match = filename.match(/^(akt-[ivxlcdm]+)/i);
    return match ? match[1].toLowerCase() : '';
  }

  function getEncountersForAct(campaignPath: string, actFilename: string): string[] {
    const actKey = getActKey(actFilename);
    if (!actKey) return [];
    return (encounterFiles[campaignPath] ?? []).filter(filename =>
      (encounterTags[`${campaignPath}/${filename}`] ?? []).includes(actKey)
    );
  }

  async function loadEncounters(campaignPath: string) {
    const key = campaignPath;
    const dir = `${VAULT_BASE}/${campaignPath}/${ENCOUNTERS_SUBDIR}`;
    try {
      const files = await invoke<string[]>('list_json_files', { path: dir });
      encounterFiles[key] = files;
      files.forEach(async (filename) => {
        const path = `${dir}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          encounterNames[`${key}/${filename}`] = data.name ?? filename.replace('.json', '');
          encounterTags[`${key}/${filename}`] = data.tags ?? [];
        } catch {
          encounterNames[`${key}/${filename}`] = filename.replace('.json', '');
          encounterTags[`${key}/${filename}`] = [];
        }
      });
    } catch {
      encounterFiles[key] = [];
    }
  }

  async function openEncounter(campaignPath: string, filename: string) {
    const path = `${VAULT_BASE}/${campaignPath}/${ENCOUNTERS_SUBDIR}/${filename}`;
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'encounter' });
    try {
      const content = await invoke<string>('read_file_content', { path });
      setFileContent(content);
    } catch {
      setFileContent('{}');
    }
  }

  async function createActEncounter(campaignPath: string, actFilename: string, e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const actKey = `${campaignPath}/${actFilename}`;
    const raw = newActEncounterInput[actKey]?.trim();
    if (!raw) return;

    const actTag = getActKey(actFilename);
    const slug = slugify(raw);
    const filename = (actTag ? `${actTag}-` : '') + slug + '.json';
    const path = `${VAULT_BASE}/${campaignPath}/${ENCOUNTERS_SUBDIR}/${filename}`;
    const template = {
      name: raw.charAt(0).toUpperCase() + raw.slice(1),
      description: '',
      monsters: [],
      difficulty: 'mittel',
      xp_total: 0,
      party_size: 4,
      party_level: 1,
      location: '',
      loot: '',
      tags: actTag ? [actTag] : [],
      notes: '',
    };

    try {
      await invoke('write_file_content', { path, content: JSON.stringify(template, null, 2) });
      showNewActEncounterInput[actKey] = false;
      newActEncounterInput[actKey] = '';
      await loadEncounters(campaignPath);
      await openEncounter(campaignPath, filename);
    } catch (err) {
      console.error('Encounter konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewActEncounter(actKey: string, e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewActEncounterInput[actKey] = false; }
  }

  // --- Kampagnen ---
  async function loadSection(campaignPath: string, section: typeof sections[0]) {
    const key = `${campaignPath}/${section.subdir}`;
    try {
      const files = await invoke<string[]>('list_directory', { path: `${VAULT_BASE}/${campaignPath}/${section.subdir}` });
      sectionFiles[key] = files;
      // Load titles concurrently — UI updates as they arrive
      files.forEach(async (filename) => {
        const path = `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const match = content.match(/^#\s+(.+)$/m);
          fileTitles[path] = match ? match[1].trim() : filename.replace('.md', '');
        } catch {
          fileTitles[path] = filename.replace('.md', '');
        }
      });
    } catch {
      sectionFiles[key] = [];
    }
    if (section.type === 'act') {
      await loadEncounters(campaignPath);
    }
  }

  // Reload all currently expanded sections when vault files change (e.g. after agent writes).
  $effect(() => {
    const _v = $vaultVersion;
    const campaign = $activeCampaign;
    if (!campaign) return;
    for (const section of sections) {
      const key = `${campaign.path}/${section.subdir}`;
      if (expanded[key]) loadSection(campaign.path, section);
    }
  });

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
      setFileContent(content);
    } catch (e) {
      setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  }

  async function openCampaignFile(campaignPath: string) {
    const fullPath = `${VAULT_BASE}/${campaignPath}/campaign.md`;
    activeFile.set({ name: 'campaign', path: fullPath, type: 'campaign' });
    try {
      const content = await invoke<string>('read_file_content', { path: fullPath });
      setFileContent(content);
    } catch (e) {
      setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
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
      const sectionTemplate =
        section.type === 'act'
          ? `# ${title}\n\n## Summary\nKurze Beschreibung dieses Aktes und erwartetes Outcome.\n\n## Details\n\n### Encounter / Szenen\n\n### NSCs & Motivationen\n\n### Mögliche Outcomes\n\n`
          : section.type === 'session'
          ? `# ${title}\n\n**Datum:**\n\n## Charaktere\n- \n\n## Was passierte\n\n## Wichtige Ereignisse\n\n## Nächste Sitzung\n\n`
          : `# ${title}\n\n`;
      await invoke('write_file_content', { path: fullPath, content: sectionTemplate });
      showNewFileInput[key] = false;
      newFileInput[key] = '';
      await loadSection(campaignPath, section);
      await openFile(campaignPath, section, filename);
      if (section.type === 'act') loadActSummaries(campaignPath);
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

  <!-- Monster (global) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleMonsters}>
        <span class="arrow" class:open={monstersExpanded}>›</span>
        Monster
      </button>
      <button class="add-btn" title="Neues Monster" onclick={() => { monstersExpanded = true; loadMonsters(); showNewMonsterInput = true; newMonsterInput = ''; }}>
        +
      </button>
    </div>

    {#if monstersExpanded}
      <div class="file-list">
        {#if monsterFiles.length}
          {#each monsterFiles as filename}
            <button
              class="file-entry"
              class:active={$activeFile?.path?.endsWith(filename)}
              onclick={() => openMonster(filename)}
            >
              {monsterNames[filename] ?? filename.replace('.json', '')}
            </button>
          {/each}
        {:else if !showNewMonsterInput}
          <span class="empty">Keine Monster</span>
        {/if}

        {#if showNewMonsterInput}
          <div class="new-file-row">
            <input
              class="new-file-input"
              bind:value={newMonsterInput}
              placeholder="Name…"
              onkeydown={(e) => { createMonster(e); cancelNewMonster(e); }}
              autofocus
            />
            <button class="confirm-btn" onclick={(e) => createMonster(e)}>✓</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="divider"></div>

  <!-- Kampagnen Header -->
  <div class="section-row campaigns-header">
    <span class="campaigns-label">Kampagnen</span>
    <button class="add-btn" style="opacity:1" title="Neue Kampagne" onclick={() => { showNewCampaignInput = true; newCampaignInput = ''; }}>+</button>
  </div>

  {#if showNewCampaignInput}
    <div class="new-file-row" style="padding-left: 1rem">
      <input
        class="new-file-input"
        bind:value={newCampaignInput}
        placeholder="Kampagnenname…"
        onkeydown={(e) => { createCampaign(e); cancelNewCampaign(e); }}
        autofocus
      />
      <button class="confirm-btn" onclick={(e) => createCampaign(e)}>✓</button>
    </div>
  {/if}

  <!-- Kampagnen Liste -->
  {#each campaigns as campaign}
    <div class="campaign-section">
      <button
        class="campaign-title"
        class:active={$activeCampaign?.id === campaign.id}
        onclick={() => { activeCampaign.set({ ...campaign }); openCampaignFile(campaign.path); loadActSummaries(campaign.path); }}
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
                    {@const filePath = `${VAULT_BASE}/${campaign.path}/${section.subdir}/${filename}`}
                    {#if section.type === 'act'}
                      {@const actEncKey = `${campaign.path}/${filename}`}
                      {@const actEncs = getEncountersForAct(campaign.path, filename)}
                      <div class="act-row">
                        <button
                          class="file-entry act-entry"
                          class:active={$activeFile?.path?.endsWith(filename)}
                          onclick={() => openFile(campaign.path, section, filename)}
                          title={filename.replace('.md', '')}
                        >
                          {fileTitles[filePath] ?? filename.replace('.md', '')}
                        </button>
                        <button
                          class="add-btn"
                          title="Encounter hinzufügen"
                          onclick={() => { showNewActEncounterInput[actEncKey] = true; newActEncounterInput[actEncKey] = ''; }}
                        >+</button>
                      </div>
                      {#each actEncs as encFilename}
                        <button
                          class="file-entry encounter-entry act-enc-entry"
                          class:active={$activeFile?.path?.endsWith(encFilename)}
                          onclick={() => openEncounter(campaign.path, encFilename)}
                          title={encFilename.replace('.json', '')}
                        >
                          ⚡ {encounterNames[`${campaign.path}/${encFilename}`] ?? encFilename.replace('.json', '')}
                        </button>
                      {/each}
                      {#if showNewActEncounterInput[actEncKey]}
                        <div class="new-file-row act-enc-input">
                          <input
                            class="new-file-input"
                            bind:value={newActEncounterInput[actEncKey]}
                            placeholder="Encounter…"
                            onkeydown={(e) => { createActEncounter(campaign.path, filename, e); cancelNewActEncounter(actEncKey, e); }}
                            autofocus
                          />
                          <button class="confirm-btn" onclick={(e) => createActEncounter(campaign.path, filename, e)}>✓</button>
                        </div>
                      {/if}
                    {:else}
                      <button
                        class="file-entry"
                        class:active={$activeFile?.path?.endsWith(filename)}
                        onclick={() => openFile(campaign.path, section, filename)}
                        title={filename.replace('.md', '')}
                      >
                        {fileTitles[filePath] ?? filename.replace('.md', '')}
                      </button>
                    {/if}
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
    width: 100%;
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

  .campaigns-header {
    padding: 0.4rem 0.5rem 0.4rem 1rem;
  }

  .campaigns-label {
    flex: 1;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c7086;
  }

  .campaign-section {
    padding: 0.25rem 0;
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

  .encounter-entry { color: #89dceb88; }
  .encounter-entry:hover { color: #89dceb; }
  .encounter-entry.active { color: #89dceb; }

  .act-row {
    display: flex;
    align-items: center;
  }

  .act-entry {
    flex: 1;
    min-width: 0;
  }

  .act-row:hover .add-btn {
    opacity: 1;
  }

  .act-enc-entry {
    padding-left: 3.5rem;
    font-size: 0.8rem;
  }

  .act-enc-input {
    padding-left: 3rem;
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
