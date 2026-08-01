<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount, untrack } from 'svelte';
  import { activeCampaign, activeFile, setFileContent, vaultVersion } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { loadActSummaries, loadEncounterContext, loadCampaignContent } from '../../stores/context';
  import { deleteEntry } from '../../services/sidebar/deleteEntry';
  import type { Campaign, FileEntry } from '../../types';
  import { slugKeepUmlauts, slugToName } from '../../utils/text';
  import SectionHeader from './SectionHeader.svelte';
  import './tree.css';

  interface EntryInfo { name: string; is_dir: boolean; }

  const VAULT_BASE = './vault/campaigns';

  const sections: { label: string; subdir: string; type: FileEntry['type'] }[] = [
    { label: 'Akte', subdir: 'acts', type: 'act' },
    { label: 'Sessions', subdir: 'sessions', type: 'session' },
    { label: 'NPCs', subdir: 'npcs', type: 'npc' },
    { label: 'Welt', subdir: 'world', type: 'world' },
    { label: 'Notizen', subdir: 'notes', type: 'notes' },
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

  // Encounter liegen je Akt-Verzeichnis; Key: `${campaignPath}/${actDirName}`.
  let encounterFiles: Record<string, string[]> = $state({});
  // Key: `${campaignPath}/${actDirName}/${filename}`
  let encounterNames: Record<string, string> = $state({});
  let showNewActEncounterInput: Record<string, boolean> = $state({});
  let newActEncounterInput: Record<string, string> = $state({});

  async function loadTemplate(type: string): Promise<string | null> {
    const ext = type === 'npc' ? 'json' : 'md';
    try {
      return await invoke<string>('read_file_content', { path: `./vault/templates/${type}.${ext}` });
    } catch {
      return null;
    }
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

  export async function reload() {
    await loadCampaigns();
    const campaign = get(activeCampaign);
    if (!campaign) return;
    for (const section of sections) {
      const key = `${campaign.path}/${section.subdir}`;
      if (expanded[key]) await loadSection(campaign.path, section);
    }
  }

  onMount(loadCampaigns);

  // Reaktives Laden: immer wenn activeCampaign sich ändert, Kontext neu laden.
  // Fixes: (1) HMR-Store-Reset, (2) Code-Pfade die activeCampaign.set() ohne Lade-Calls aufrufen.
  $effect(() => {
    const campaign = $activeCampaign;
    if (campaign?.path) {
      loadCampaignContent(campaign.path);
      loadActSummaries(campaign.path);
      loadEncounterContext(campaign.path);
    }
  });

  async function createCampaign(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = newCampaignInput.trim();
    if (!raw) return;

    const slug = slugKeepUmlauts(raw);
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const campaignMd = `${VAULT_BASE}/${slug}/campaign.md`;

    const tmpl = await loadTemplate('campaign');
    const template = `# ${name}\n\n` + (tmpl ?? `## Beschreibung\n\n\n## Hintergrund\n\n\n## Hauptziele\n\n\n## Wichtige Orte\n\n\n## Notizen\n\n`);
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

  async function loadEncountersForAct(campaignPath: string, actDirName: string) {
    const key = `${campaignPath}/${actDirName}`;
    const dir = `${VAULT_BASE}/${campaignPath}/acts/${actDirName}/encounters`;
    try {
      const files = await invoke<string[]>('list_json_files', { path: dir });
      encounterFiles[key] = files;
      files.forEach(async (filename) => {
        const path = `${dir}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          encounterNames[`${key}/${filename}`] = data.name ?? filename.replace('.json', '');
        } catch {
          encounterNames[`${key}/${filename}`] = filename.replace('.json', '');
        }
      });
    } catch {
      encounterFiles[key] = [];
    }
  }

  async function openEncounter(campaignPath: string, actDirName: string, filename: string) {
    if (!(await confirmNavigation())) return;
    const path = `${VAULT_BASE}/${campaignPath}/acts/${actDirName}/encounters/${filename}`;
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'encounter' });
    // EncounterCard lädt den Inhalt + Monster selbst via $effect
  }

  async function createActEncounter(campaignPath: string, actDirName: string, e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const actKey = `${campaignPath}/${actDirName}`;
    const raw = newActEncounterInput[actKey]?.trim();
    if (!raw) return;

    const slug = slugKeepUmlauts(raw);
    const filename = slug + '.json';
    const path = `${VAULT_BASE}/${campaignPath}/acts/${actDirName}/encounters/${filename}`;
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
      notes: '',
      status: 'planned',
    };

    try {
      await invoke('write_file_content', { path, content: JSON.stringify(template, null, 2) });
      showNewActEncounterInput[actKey] = false;
      newActEncounterInput[actKey] = '';
      await loadEncountersForAct(campaignPath, actDirName);
      await openEncounter(campaignPath, actDirName, filename);
      loadEncounterContext(campaignPath);
    } catch (err) {
      console.error('Encounter konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewActEncounter(actKey: string, e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewActEncounterInput[actKey] = false; }
  }

  async function loadSection(campaignPath: string, section: typeof sections[0]) {
    const key = `${campaignPath}/${section.subdir}`;
    if (section.type === 'act') {
      try {
        const entries = await invoke<EntryInfo[]>('list_entries', { path: `${VAULT_BASE}/${campaignPath}/acts` });
        const actDirs = entries.filter((e) => e.is_dir).map((e) => e.name);
        sectionFiles[key] = actDirs;
        for (const dirName of actDirs) {
          const indexPath = `${VAULT_BASE}/${campaignPath}/acts/${dirName}/index.md`;
          try {
            const content = await invoke<string>('read_file_content', { path: indexPath });
            const match = content.match(/^#\s+(.+)$/m);
            fileTitles[indexPath] = match ? match[1].trim() : dirName;
          } catch {
            fileTitles[indexPath] = dirName;
          }
          await loadEncountersForAct(campaignPath, dirName);
        }
      } catch {
        sectionFiles[key] = [];
      }
    } else if (section.type === 'npc') {
      try {
        const files = await invoke<string[]>('list_json_files', { path: `${VAULT_BASE}/${campaignPath}/${section.subdir}` });
        sectionFiles[key] = files;
        files.forEach(async (filename) => {
          const path = `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;
          try {
            const content = await invoke<string>('read_file_content', { path });
            const data = JSON.parse(content);
            fileTitles[path] = (data.name as string) || filename.replace('.json', '');
          } catch {
            fileTitles[path] = filename.replace('.json', '');
          }
        });
      } catch {
        sectionFiles[key] = [];
      }
    } else {
      try {
        const files = await invoke<string[]>('list_directory', { path: `${VAULT_BASE}/${campaignPath}/${section.subdir}` });
        sectionFiles[key] = files;
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

  // Öffnet eine Datei (z.B. via Link-Navigation) → die zugehörige Sektion im Baum
  // aufklappen, damit der aktive Eintrag sichtbar/markiert ist. Reagiert nur auf den
  // Pfad-Wechsel (untrack verhindert ein Re-Expandieren, wenn der Nutzer manuell
  // zuklappt). Encounters erscheinen automatisch, sobald die Akte-Sektion geladen ist.
  $effect(() => {
    const path = $activeFile?.path;
    if (!path) return;
    const campaign = $activeCampaign;
    if (!campaign) return;
    const base = `${VAULT_BASE}/${campaign.path}/`;
    if (!path.startsWith(base)) return; // nur Dateien der aktiven Kampagne
    const subdir = path.slice(base.length).split('/')[0]; // acts | world | npcs | sessions | notes
    const section = sections.find((s) => s.subdir === subdir);
    if (!section) return; // z.B. campaign.md selbst → kein Überpunkt
    const key = `${campaign.path}/${section.subdir}`;
    untrack(() => {
      if (!expanded[key]) {
        expanded[key] = true;
        loadSection(campaign.path, section);
      }
    });
  });

  async function openFile(campaignPath: string, section: typeof sections[0], filenameOrDir: string) {
    if (!(await confirmNavigation())) return;
    const fullPath = section.type === 'act'
      ? `${VAULT_BASE}/${campaignPath}/acts/${filenameOrDir}/index.md`
      : `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filenameOrDir}`;
    const displayName = filenameOrDir.replace(/\.(md|json)$/, '');
    activeFile.set({ name: displayName, path: fullPath, type: section.type });
    try {
      const content = await invoke<string>('read_file_content', { path: fullPath });
      setFileContent(content);
    } catch (e) {
      setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  }

  /** Kampagne wechseln — vorher ungespeicherte Änderungen abfragen. */
  async function selectCampaign(campaign: Campaign) {
    if (!(await confirmNavigation())) return;
    activeCampaign.set({ ...campaign });
    openCampaignFile(campaign.path);
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

    const slug = slugKeepUmlauts(raw);
    const title = raw.charAt(0).toUpperCase() + raw.slice(1);

    const isNpc = section.type === 'npc';
    const ext = isNpc ? '.json' : '.md';
    const fullPath = section.type === 'act'
      ? `${VAULT_BASE}/${campaignPath}/acts/${slug}/index.md`
      : `${VAULT_BASE}/${campaignPath}/${section.subdir}/${slug}${ext}`;

    try {
      const tmpl = await loadTemplate(section.type);
      let sectionTemplate: string;
      if (isNpc) {
        const obj = tmpl ? JSON.parse(tmpl) : {};
        obj.name = title;
        sectionTemplate = JSON.stringify(obj, null, 2);
      } else {
        sectionTemplate = `# ${title}\n\n` + (tmpl ?? '');
      }
      await invoke('write_file_content', { path: fullPath, content: sectionTemplate });
      showNewFileInput[key] = false;
      newFileInput[key] = '';
      await loadSection(campaignPath, section);
      await openFile(campaignPath, section, slug + ext);
      if (section.type === 'act') loadActSummaries(campaignPath);
    } catch (err) {
      console.error('Datei konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewFile(key: string, e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewFileInput[key] = false; newFileInput[key] = ''; }
  }
</script>

<!-- Hover-Löschbutton für eine Baumzeile; in `.entry-row` neben den .file-entry-Button gesetzt. -->
{#snippet delBtn(onDelete: () => void)}
  <button class="entry-del" title="Löschen" onclick={(e) => { e.stopPropagation(); onDelete(); }}>🗑</button>
{/snippet}

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

{#each campaigns as campaign}
  <div class="campaign-section">
    <div class="entry-row">
      <button
        class="campaign-title"
        class:active={$activeCampaign?.id === campaign.id}
        onclick={() => selectCampaign(campaign)}
      >
        {campaign.name}
      </button>
      {@render delBtn(() => deleteEntry(`${VAULT_BASE}/${campaign.path}`, campaign.name, true, () => { if (get(activeCampaign)?.path === campaign.path) { activeCampaign.set(null); activeFile.set(null); setFileContent(''); } return loadCampaigns(); }))}
    </div>

    {#if $activeCampaign?.id === campaign.id}
      {#each sections as section}
        {@const key = `${campaign.path}/${section.subdir}`}
        <div class="section">
          <SectionHeader
            label={section.label}
            expanded={expanded[key]}
            ontoggle={() => toggleSection(campaign.path, section)}
          >
            {#snippet actions()}
              <button class="add-btn" title="Neue Datei" onclick={() => { expanded[key] = true; loadSection(campaign.path, section); startNewFile(key); }}>
                +
              </button>
            {/snippet}
          </SectionHeader>

          {#if expanded[key]}
            <div class="file-list">
              {#if sectionFiles[key]?.length}
                {#each sectionFiles[key] as filename}
                  {@const filePath = section.type === 'act'
                    ? `${VAULT_BASE}/${campaign.path}/acts/${filename}/index.md`
                    : `${VAULT_BASE}/${campaign.path}/${section.subdir}/${filename}`}
                  {#if section.type === 'act'}
                    {@const actEncKey = `${campaign.path}/${filename}`}
                    {@const actEncs = encounterFiles[actEncKey] ?? []}
                    <div class="act-row">
                      <button
                        class="file-entry act-entry"
                        class:active={$activeFile?.path === filePath}
                        onclick={() => openFile(campaign.path, section, filename)}
                        title={filename}
                      >
                        {fileTitles[filePath] ?? filename}
                      </button>
                      <button
                        class="add-btn"
                        title="Encounter hinzufügen"
                        onclick={() => { showNewActEncounterInput[actEncKey] = true; newActEncounterInput[actEncKey] = ''; }}
                      >+</button>
                      {@render delBtn(() => deleteEntry(`${VAULT_BASE}/${campaign.path}/acts/${filename}`, fileTitles[filePath] ?? filename, true, () => loadSection(campaign.path, section)))}
                    </div>
                    {#each actEncs as encFilename}
                      {@const encPath = `${VAULT_BASE}/${campaign.path}/acts/${filename}/encounters/${encFilename}`}
                      <div class="entry-row">
                        <button
                          class="file-entry encounter-entry act-enc-entry"
                          class:active={$activeFile?.path === encPath}
                          onclick={() => openEncounter(campaign.path, filename, encFilename)}
                          title={encFilename.replace('.json', '')}
                        >
                          ⚡ {encounterNames[`${actEncKey}/${encFilename}`] ?? encFilename.replace('.json', '')}
                        </button>
                        {@render delBtn(() => deleteEntry(encPath, encounterNames[`${actEncKey}/${encFilename}`] ?? encFilename.replace('.json', ''), false, () => loadEncountersForAct(campaign.path, filename)))}
                      </div>
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
                    <div class="entry-row">
                      <button
                        class="file-entry"
                        class:active={$activeFile?.path === filePath}
                        onclick={() => openFile(campaign.path, section, filename)}
                        title={fileTitles[filePath] ?? filename.replace(/\.(md|json)$/, '')}
                      >
                        {fileTitles[filePath] ?? filename.replace(/\.(md|json)$/, '')}
                      </button>
                      {@render delBtn(() => deleteEntry(filePath, fileTitles[filePath] ?? filename.replace(/\.(md|json)$/, ''), false, () => loadSection(campaign.path, section)))}
                    </div>
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

<style>
  .campaigns-header {
    padding: 0.4rem 0.5rem 0.4rem 1rem;
  }

  .campaigns-label {
    flex: 1;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
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
    color: var(--ink);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .campaign-title:hover,
  .campaign-title.active {
    background: var(--surface);
    color: var(--arcane);
  }

  .section {
    padding: 0 0 0.25rem 0;
  }

  .act-row {
    display: flex;
    align-items: center;
  }

  .act-row:hover .entry-del,
  .act-row:hover .add-btn {
    opacity: 1;
  }
</style>
