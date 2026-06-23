<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import { PDFDocument } from 'pdf-lib';
  import DragonMark from './DragonMark.svelte';
  import ItemCreateModal from './ItemCreateModal.svelte';
  import VaultTransferModal from './VaultTransferModal.svelte';
  import { activeCampaign, activeFile, setFileContent, vaultVersion } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import { loadActSummaries, loadEncounterContext, loadCampaignContent } from '../stores/context';
  import type { Campaign, FileEntry } from '../types';
  import { MONSTER_TEMPLATE as monsterTemplate, monsterTypeLabel } from '../types';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { parseCharacterData, emptySpells, type CharacterJSON } from '../pdf/characterFields';
  import {
    ITEMS_PATH,
    CATEGORY_COLORS as ITEM_CAT_COLORS,
    CATEGORY_LABELS as ITEM_CAT_LABELS,
    DIR_TO_CATEGORY,
    invalidateItemCache,
  } from '../itemLibrary';
  import { SCHOOL_COLORS } from '../spellLibrary';

  interface EntryInfo { name: string; is_dir: boolean; }

  const VAULT_BASE = './vault/campaigns';
  const CHARACTERS_PATH = './vault/characters';
  const MONSTERS_PATH = './vault/monsters';
  const SPELLS_PATH = './vault/spells';

  // Ordnername → englischer Schulschlüssel (für neuen Zauber-JSON)
  const SCHOOL_DIR_TO_KEY: Record<string, string> = {
    'bannmagie':       'abjuration',
    'beschwörung':     'conjuration',
    'erkenntnismagie': 'divination',
    'verzauberung':    'enchantment',
    'hervorrufung':    'evocation',
    'illusionsmagie':  'illusion',
    'nekromantie':     'necromancy',
    'verwandlung':     'transmutation',
  };

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

  async function loadTemplate(type: string): Promise<string | null> {
    const ext = type === 'npc' ? 'json' : 'md';
    try {
      return await invoke<string>('read_file_content', { path: `./vault/templates/${type}.${ext}` });
    } catch {
      return null;
    }
  }

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

  async function reloadAll() {
    await loadCampaigns();
    if (charactersExpanded) await loadCharacters();
    if (monstersExpanded) await loadMonsters();
    if (spellsExpanded) { spellsBySchool = {}; await loadSpells(); }
    const campaign = $activeCampaign;
    if (campaign) {
      for (const section of sections) {
        const key = `${campaign.path}/${section.subdir}`;
        if (expanded[key]) await loadSection(campaign.path, section);
      }
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

  // --- Charaktere (global) ---
  let charactersExpanded = $state(false);
  let characterEntries: EntryInfo[] = $state([]);
  let showNewCharInput = $state(false);
  let newCharInput = $state('');
  let pdfImporting = $state(false);
  let pdfImportError = $state('');

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
    if (!(await confirmNavigation())) return;
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

    const slug = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_äöü]/g, '');
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const dirPath = `${CHARACTERS_PATH}/${slug}`;

    const json: CharacterJSON = {
      _version: 1,
      name,
      classLevel: '', playerName: '', background: '', race: '', xp: '',
      str: 10, ges: 10, kon: 10, int: 10, wei: 10, cha: 10,
      strMod: 0, gesMod: 0, konMod: 0, intMod: 0, weiMod: 0, chaMod: 0,
      ac: '', initiative: '', speed: '', hpMax: '', hpCurrent: '', hpTemp: '',
      proficiencyBonus: 2, passivePerception: '', hitDice: '',
      strSaveProf: false, gesSaveProf: false, konSaveProf: false,
      intSaveProf: false, weiSaveProf: false, chaSaveProf: false,
      skills: {},
      attacks: [],
      classFeatures: '', traits: '', ideals: '', bonds: '', flaws: '',
      languages: [], tools: [], alleskoenner: false,
      currency: { km: '', sm: '', em: '', gm: '', pm: '' },
      inventory: [], inventoryNotes: '', totalWeight: '',
      spells: emptySpells(),
    };

    const gmNotes = `# GM-Notizen: ${name}\n\n## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`;

    try {
      await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify(json, null, 2) });
      await invoke('write_file_content', { path: `${dirPath}/gm-notes.md`, content: gmNotes });
      showNewCharInput = false;
      newCharInput = '';
      await loadCharacters();
      await openCharacter({ name: slug, is_dir: true });
    } catch (err) {
      console.error('Charakter konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewChar(e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewCharInput = false; newCharInput = ''; }
  }

  async function importFromPdf() {
    pdfImportError = '';
    let path: string;
    try {
      const defaultPath = await invoke<string>('get_absolute_path', { path: CHARACTERS_PATH }).catch(() => undefined);
      const selected = await openFileDialog({
        multiple: false,
        defaultPath,
        filters: [{ name: 'PDF Charakterbogen', extensions: ['pdf'] }],
      });
      if (!selected) return;
      path = selected as string;
    } catch (e) {
      pdfImportError = `Dateiauswahl fehlgeschlagen: ${e}`;
      return;
    }

    pdfImporting = true;
    try {
      const base64 = await invoke<string>('read_file_base64', { path });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdf.getForm();
      const fields: Record<string, string> = {};
      for (const field of form.getFields()) {
        const name = field.getName();
        try { fields[name] = form.getTextField(name).getText() ?? ''; }
        catch { try { fields[name] = form.getCheckBox(name).isChecked() ? 'On' : 'Off'; } catch { fields[name] = ''; } }
      }

      const data = parseCharacterData(fields);
      if (!data.spells) data.spells = emptySpells();

      const charName = data.name || path.split(/[/\\]/).pop()?.replace(/\.pdf$/i, '') || 'unbekannt';
      const slug = charName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const dirPath = `${CHARACTERS_PATH}/${slug}`;
      const pdfFilename = path.split(/[/\\]/).pop() ?? path;

      const json: CharacterJSON = {
        _version: 1,
        _importedFrom: pdfFilename,
        _importedAt: new Date().toISOString(),
        ...data,
      };
      await invoke('write_file_content', {
        path: `${dirPath}/character.json`,
        content: JSON.stringify(json, null, 2),
      });

      charactersExpanded = true;
      await loadCharacters();
      await openCharacter({ name: slug, is_dir: true });
    } catch (e) {
      pdfImportError = `Import fehlgeschlagen: ${e}`;
    } finally {
      pdfImporting = false;
    }
  }

  // --- Monster (global) ---
  let monstersExpanded = $state(false);
  // group → { filename, name }[]
  let monsterGroups: Record<string, { filename: string; name: string }[]> = $state({});
  let openMonsterGroups: Record<string, boolean> = $state({});
  let showNewMonsterInput = $state(false);
  let newMonsterInput = $state('');

  async function loadMonsters() {
    try {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: MONSTERS_PATH });
      const dirs = entries.filter((e) => e.is_dir).map((e) => e.name);
      const rootFiles = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => e.name);

      async function loadEntry(path: string, relFilename: string): Promise<{ filename: string; name: string; typeKey: string }> {
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          return { filename: relFilename, name: data.name ?? relFilename.replace('.json', ''), typeKey: data.type ?? '' };
        } catch { return { filename: relFilename, name: relFilename.replace('.json', ''), typeKey: '' }; }
      }

      const allEntries: { filename: string; name: string; typeKey: string }[] = [];
      for (const dir of dirs) {
        const files = await invoke<string[]>('list_json_files', { path: `${MONSTERS_PATH}/${dir}` }).catch(() => [] as string[]);
        allEntries.push(...await Promise.all(files.map((f) => loadEntry(`${MONSTERS_PATH}/${dir}/${f}`, `${dir}/${f}`))));
      }
      allEntries.push(...await Promise.all(rootFiles.map((f) => loadEntry(`${MONSTERS_PATH}/${f}`, f))));

      const newGroups: Record<string, { filename: string; name: string }[]> = {};
      for (const e of allEntries) {
        const key = e.typeKey || 'unknown';
        if (!newGroups[key]) newGroups[key] = [];
        newGroups[key].push({ filename: e.filename, name: e.name });
      }
      // Gruppen alphabetisch nach deutschem Label sortieren
      monsterGroups = Object.fromEntries(
        Object.entries(newGroups).sort(([a], [b]) => monsterTypeLabel(a).localeCompare(monsterTypeLabel(b), 'de'))
      );
    } catch {
      monsterGroups = {};
    }
  }

  function toggleMonsterGroup(group: string) {
    openMonsterGroups[group] = !openMonsterGroups[group];
  }

  async function toggleMonsters() {
    monstersExpanded = !monstersExpanded;
    if (monstersExpanded) await loadMonsters();
  }

  async function openMonster(filename: string) {
    if (!(await confirmNavigation())) return;
    const path = `${MONSTERS_PATH}/${filename}`;
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'monster' });
    // MonsterCard lädt den Inhalt selbst via $effect
  }

  async function createMonster(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = newMonsterInput.trim();
    if (!raw) return;

    const slug = slugify(raw);
    const relPath = `${slug}.json`;
    const path = `${MONSTERS_PATH}/${relPath}`;
    const template = { ...monsterTemplate, name: raw.charAt(0).toUpperCase() + raw.slice(1) };

    try {
      await invoke('write_file_content', { path, content: JSON.stringify(template, null, 2) });
      showNewMonsterInput = false;
      newMonsterInput = '';
      await loadMonsters();
      await openMonster(relPath);
    } catch (err) {
      console.error('Monster konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewMonster(e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewMonsterInput = false; newMonsterInput = ''; }
  }

  // --- Zauber (global, nach Schule) ---
  let spellsExpanded = $state(false);
  let spellSchools: string[] = $state([]);
  let spellsBySchool: Record<string, { filename: string; name: string }[]> = $state({});
  let openSpellSchools: Record<string, boolean> = $state({});
  let spellSearch = $state('');
  let showNewSpellInput = $state(false);
  let newSpellName = $state('');
  let newSpellSchool = $state('');

  // Wenn Suchbegriff eingegeben, alle Schulen laden und gefiltert anzeigen
  $effect(() => {
    if (spellSearch.trim() && spellSchools.length) {
      for (const school of spellSchools) {
        if (!spellsBySchool[school]) loadSpellSchool(school);
      }
    }
  });

  let spellSearchResults = $derived.by(() => {
    const q = spellSearch.trim().toLowerCase();
    if (!q) return null;
    const results: { school: string; filename: string; name: string }[] = [];
    for (const school of spellSchools) {
      for (const spell of spellsBySchool[school] ?? []) {
        if (spell.name.toLowerCase().includes(q)) results.push({ school, ...spell });
      }
    }
    return results;
  });

  async function loadSpells() {
    try {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: SPELLS_PATH });
      spellSchools = entries.filter((e) => e.is_dir).map((e) => e.name).sort();
    } catch {
      spellSchools = [];
    }
  }

  async function loadSpellSchool(school: string) {
    if (spellsBySchool[school]) return;
    try {
      const files = await invoke<string[]>('list_json_files', { path: `${SPELLS_PATH}/${school}` });
      spellsBySchool[school] = await Promise.all(
        files.map(async (f) => {
          const path = `${SPELLS_PATH}/${school}/${f}`;
          try {
            const content = await invoke<string>('read_file_content', { path });
            const data = JSON.parse(content);
            return { filename: f, name: data.name ?? f.replace('.json', '') };
          } catch {
            return { filename: f, name: f.replace('.json', '') };
          }
        })
      );
      spellsBySchool[school].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    } catch {
      spellsBySchool[school] = [];
    }
  }

  async function toggleSpells() {
    spellsExpanded = !spellsExpanded;
    if (spellsExpanded) await loadSpells();
  }

  async function toggleSpellSchool(school: string) {
    openSpellSchools[school] = !openSpellSchools[school];
    if (openSpellSchools[school]) await loadSpellSchool(school);
  }

  async function openSpell(school: string, filename: string) {
    if (!(await confirmNavigation())) return;
    const path = `${SPELLS_PATH}/${school}/${filename}`;
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'spell' });
  }

  async function createSpell(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = newSpellName.trim();
    const school = newSpellSchool || spellSchools[0];
    if (!raw || !school) return;

    const slug = slugify(raw);
    const filename = slug + '.json';
    const path = `${SPELLS_PATH}/${school}/${filename}`;
    const template = {
      name: raw.charAt(0).toUpperCase() + raw.slice(1),
      level: '1',
      school: SCHOOL_DIR_TO_KEY[school] ?? 'evocation',
      casting_time: '1 Aktion',
      range: '9 Meter',
      components: { verbal: true, somatic: false, material: false, materials_needed: null },
      duration: 'Unmittelbar',
      ritual: false,
      classes: [],
      description: '',
      higher_levels: null,
      source: 'eigen',
    };

    try {
      await invoke('write_file_content', { path, content: JSON.stringify(template, null, 2) });
      showNewSpellInput = false;
      newSpellName = '';
      // Schule aufklappen und Cache leeren damit neu geladen wird
      delete spellsBySchool[school];
      spellsBySchool = { ...spellsBySchool };
      openSpellSchools[school] = true;
      await loadSpellSchool(school);
      await openSpell(school, filename);
    } catch (err) {
      console.error('Zauber konnte nicht erstellt werden:', err);
    }
  }

  function cancelNewSpell(e: KeyboardEvent) {
    if (e.key === 'Escape') { showNewSpellInput = false; newSpellName = ''; }
  }

  // --- Gegenstände (global, nach Kategorie) ---
  // Anzeige-Labels kommen direkt aus ITEM_CAT_LABELS (dir === category).

  let itemsExpanded = $state(false);
  let itemDirs: string[] = $state([]);
  let itemsByDir: Record<string, { filename: string; name: string }[]> = $state({});
  let openItemDirs: Record<string, boolean> = $state({});
  let itemSearch = $state('');
  let showItemModal = $state(false);
  let showTransferModal = $state(false);

  $effect(() => {
    if (itemSearch.trim() && itemDirs.length) {
      for (const dir of itemDirs) {
        if (!itemsByDir[dir]) loadItemDir(dir);
      }
    }
  });

  let itemSearchResults = $derived.by(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return null;
    const results: { dir: string; filename: string; name: string }[] = [];
    for (const dir of itemDirs) {
      for (const item of itemsByDir[dir] ?? []) {
        if (item.name.toLowerCase().includes(q)) results.push({ dir, ...item });
      }
    }
    return results;
  });

  async function loadItems() {
    try {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: ITEMS_PATH });
      itemDirs = entries.filter((e) => e.is_dir).map((e) => e.name).sort();
    } catch {
      itemDirs = [];
    }
  }

  async function loadItemDir(dir: string) {
    if (itemsByDir[dir]) return;
    try {
      const files = await invoke<string[]>('list_json_files', { path: `${ITEMS_PATH}/${dir}` });
      itemsByDir[dir] = await Promise.all(
        files.map(async (f) => {
          const path = `${ITEMS_PATH}/${dir}/${f}`;
          try {
            const content = await invoke<string>('read_file_content', { path });
            const data = JSON.parse(content);
            return { filename: f, name: data.name_de ?? data.name ?? f.replace('.json', '') };
          } catch {
            return { filename: f, name: f.replace('.json', '') };
          }
        })
      );
      itemsByDir[dir].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    } catch {
      itemsByDir[dir] = [];
    }
  }

  async function toggleItems() {
    itemsExpanded = !itemsExpanded;
    if (itemsExpanded) await loadItems();
  }

  async function toggleItemDir(dir: string) {
    openItemDirs[dir] = !openItemDirs[dir];
    if (openItemDirs[dir]) await loadItemDir(dir);
  }

  async function openItem(dir: string, filename: string) {
    if (!(await confirmNavigation())) return;
    const path = `${ITEMS_PATH}/${dir}/${filename}`;
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'item' });
  }

  async function openItemModal() {
    itemsExpanded = true;
    await loadItems();
    showItemModal = true;
  }

  // Gegenstands-Liste neu laden, wenn sich Vault-Dateien ändern (z.B. nach Speichern eines neuen Items).
  $effect(() => {
    const _v = $vaultVersion;
    if (!itemsExpanded) return;
    void reloadOpenItemDirs();
  });

  async function reloadOpenItemDirs() {
    await loadItems();
    for (const d of itemDirs) {
      if (openItemDirs[d]) {
        invalidateItemCache(d);
        delete itemsByDir[d];
        await loadItemDir(d);
      }
    }
  }

  // --- Encounter (pro Akt-Verzeichnis) ---
  // Key: `${campaignPath}/${actDirName}`
  let encounterFiles: Record<string, string[]> = $state({});
  // Key: `${campaignPath}/${actDirName}/${filename}`
  let encounterNames: Record<string, string> = $state({});
  let showNewActEncounterInput: Record<string, boolean> = $state({});
  let newActEncounterInput: Record<string, string> = $state({});

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

    const slug = slugify(raw);
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

  // --- Kampagnen ---
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

    const slug = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöü]/g, '');
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

<aside class="sidebar">
  <div class="sidebar-header ornament-top">
    <h2><DragonMark size={18} /> DnD Planner</h2>
    <div class="header-actions">
      <button class="header-btn" title="Vault importieren / exportieren" onclick={() => (showTransferModal = true)}>⇅</button>
      <button class="reload-all-btn" title="Alles neu laden" onclick={reloadAll}>↺</button>
    </div>
  </div>

  <!-- Charaktere (global) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleCharacters}>
        <span class="arrow" class:open={charactersExpanded}>›</span>
        Charaktere
      </button>
      <button class="add-btn" title="Aus PDF importieren" disabled={pdfImporting} onclick={() => { importFromPdf(); }}>
        {pdfImporting ? '…' : 'PDF'}
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
        {#if Object.keys(monsterGroups).length}
          {#each Object.entries(monsterGroups) as [group, monsters]}
            <button
              class="monster-group-header"
              onclick={() => toggleMonsterGroup(group)}
            >
              <span class="arrow" class:open={openMonsterGroups[group]}>›</span>
              {monsterTypeLabel(group)} <span class="group-count">({monsters.length})</span>
            </button>
            {#if openMonsterGroups[group]}
              {#each monsters as { filename, name }}
                <button
                  class="file-entry monster-subentry"
                  class:active={$activeFile?.path?.endsWith(filename)}
                  onclick={() => openMonster(filename)}
                >
                  {name}
                </button>
              {/each}
            {/if}
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

  <!-- Zauber (global) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleSpells}>
        <span class="arrow" class:open={spellsExpanded}>›</span>
        Zauber
      </button>
      <button class="add-btn" title="Neuer Zauber" onclick={() => { spellsExpanded = true; loadSpells(); showNewSpellInput = true; newSpellName = ''; newSpellSchool = spellSchools[0] ?? ''; }}>
        +
      </button>
    </div>

    {#if spellsExpanded}
      <div class="spell-search-row">
        <input
          class="spell-search-input"
          bind:value={spellSearch}
          placeholder="Suchen…"
          type="search"
        />
      </div>
      <div class="file-list">
        {#if spellSearchResults !== null}
          <!-- Suchergebnisse (flach) -->
          {#if spellSearchResults.length}
            {#each spellSearchResults as { school, filename, name }}
              <button
                class="file-entry monster-subentry"
                class:active={$activeFile?.path?.includes(`/${school}/${filename}`)}
                onclick={() => openSpell(school, filename)}
                title={school}
              >
                {name}
              </button>
            {/each}
          {:else}
            <span class="empty">Keine Treffer</span>
          {/if}
        {:else if spellSchools.length}
          <!-- Gruppierte Ansicht nach Schule -->
          {#each spellSchools as school}
            {@const color = SCHOOL_COLORS[SCHOOL_DIR_TO_KEY[school]] ?? 'var(--ink)'}
            {@const spells = spellsBySchool[school]}
            <button
              class="monster-group-header"
              style="color: {color}"
              onclick={() => toggleSpellSchool(school)}
            >
              <span class="arrow" class:open={openSpellSchools[school]}>›</span>
              {school.charAt(0).toUpperCase() + school.slice(1)}
              {#if spells}<span class="group-count">({spells.length})</span>{/if}
            </button>
            {#if openSpellSchools[school]}
              {#if spells}
                {#each spells as { filename, name }}
                  <button
                    class="file-entry monster-subentry"
                    class:active={$activeFile?.path?.includes(`/${school}/${filename}`)}
                    onclick={() => openSpell(school, filename)}
                  >
                    {name}
                  </button>
                {/each}
              {:else}
                <span class="empty">Laden…</span>
              {/if}
            {/if}
          {/each}
        {:else}
          <span class="empty">Keine Zauber</span>
        {/if}

        {#if showNewSpellInput}
          <div class="new-monster-form">
            <select
              class="new-file-input"
              bind:value={newSpellSchool}
            >
              {#each spellSchools as s}
                <option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              {/each}
            </select>
            <div class="new-file-row">
              <input
                class="new-file-input"
                bind:value={newSpellName}
                placeholder="Name…"
                onkeydown={(e) => { createSpell(e); cancelNewSpell(e); }}
                autofocus
              />
              <button class="confirm-btn" onclick={(e) => createSpell(e)}>✓</button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Gegenstände (global) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleItems}>
        <span class="arrow" class:open={itemsExpanded}>›</span>
        Gegenstände
      </button>
      <button class="add-btn" title="Neuer Gegenstand" onclick={openItemModal}>
        +
      </button>
    </div>

    {#if itemsExpanded}
      <div class="spell-search-row">
        <input
          class="spell-search-input"
          bind:value={itemSearch}
          placeholder="Suchen…"
          type="search"
        />
      </div>
      <div class="file-list">
        {#if itemSearchResults !== null}
          {#if itemSearchResults.length}
            {#each itemSearchResults as { dir, filename, name }}
              <button
                class="file-entry monster-subentry"
                class:active={$activeFile?.path?.includes(`/${dir}/${filename}`)}
                onclick={() => openItem(dir, filename)}
                title={dir}
              >
                {name}
              </button>
            {/each}
          {:else}
            <span class="empty">Keine Treffer</span>
          {/if}
        {:else if itemDirs.length}
          {#each itemDirs as dir}
            {@const catKey = DIR_TO_CATEGORY[dir] ?? 'other'}
            {@const catColor = ITEM_CAT_COLORS[catKey] ?? 'var(--ink)'}
            {@const dirItems = itemsByDir[dir]}
            <button
              class="monster-group-header"
              style="color: {catColor}"
              onclick={() => toggleItemDir(dir)}
            >
              <span class="arrow" class:open={openItemDirs[dir]}>›</span>
              {ITEM_CAT_LABELS[dir] ?? dir}
              {#if dirItems}<span class="group-count">({dirItems.length})</span>{/if}
            </button>
            {#if openItemDirs[dir]}
              {#if dirItems}
                {#each dirItems as { filename, name }}
                  <button
                    class="file-entry monster-subentry"
                    class:active={$activeFile?.path?.includes(`/${dir}/${filename}`)}
                    onclick={() => openItem(dir, filename)}
                  >
                    {name}
                  </button>
                {/each}
              {:else}
                <span class="empty">Laden…</span>
              {/if}
            {/if}
          {/each}
        {:else}
          <span class="empty">Keine Gegenstände</span>
        {/if}

      </div>
    {/if}
  </div>

  {#if showItemModal}
    <ItemCreateModal
      dirs={itemDirs}
      defaultDir={itemDirs[0] ?? ''}
      onclose={() => (showItemModal = false)}
    />
  {/if}

  {#if showTransferModal}
    <VaultTransferModal onclose={() => (showTransferModal = false)} />
  {/if}

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
        onclick={() => selectCampaign(campaign)}
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
                      </div>
                      {#each actEncs as encFilename}
                        {@const encPath = `${VAULT_BASE}/${campaign.path}/acts/${filename}/encounters/${encFilename}`}
                        <button
                          class="file-entry encounter-entry act-enc-entry"
                          class:active={$activeFile?.path === encPath}
                          onclick={() => openEncounter(campaign.path, filename, encFilename)}
                          title={encFilename.replace('.json', '')}
                        >
                          ⚡ {encounterNames[`${actEncKey}/${encFilename}`] ?? encFilename.replace('.json', '')}
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
                        class:active={$activeFile?.path === filePath}
                        onclick={() => openFile(campaign.path, section, filename)}
                        title={fileTitles[filePath] ?? filename.replace(/\.(md|json)$/, '')}
                      >
                        {fileTitles[filePath] ?? filename.replace(/\.(md|json)$/, '')}
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

  .top-section {
    padding: 0.5rem 0;
  }

  .divider {
    height: 1px;
    background: var(--surface);
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
    color: var(--ink-muted);
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
    color: var(--ink);
  }

  .notes-entry {
    width: 100%;
  }

  .notes-entry.active {
    color: var(--arcane);
  }

  .add-btn {
    padding: 0 0.6rem;
    background: none;
    border: none;
    color: var(--ink-muted);
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
    color: var(--arcane);
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
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-entry:hover {
    background: var(--surface);
    color: var(--ink);
  }

  .file-entry.active {
    background: var(--border);
    color: var(--arcane);
  }

  .monster-group-header {
    width: 100%;
    text-align: left;
    padding: 0.2rem 1rem 0.2rem 1.5rem;
    background: none;
    border: none;
    color: var(--red);
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .monster-group-header:hover { color: var(--ink); }

  .monster-group-header .arrow {
    display: inline-block;
    font-size: 0.9rem;
    transition: transform 0.15s;
    transform: rotate(0deg);
    color: var(--ink-muted);
  }

  .monster-group-header .arrow.open {
    transform: rotate(90deg);
  }

  .group-count {
    color: var(--ink-muted);
    font-weight: 400;
  }

  .monster-subentry {
    padding-left: 3.5rem;
  }

  .new-monster-form {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.25rem 1rem;
  }

  .new-monster-form .new-file-input {
    width: 100%;
  }

  .encounter-entry { color: color-mix(in srgb, var(--steel) 53%, transparent); }
  .encounter-entry:hover { color: var(--steel); }
  .encounter-entry.active { color: var(--steel); }

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
    color: var(--border);
    font-style: italic;
  }

  .new-file-row {
    display: flex;
    align-items: center;
    padding: 0.25rem 0.5rem 0.25rem 2rem;
    gap: 0.25rem;
  }

  .pdf-import-block {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    padding: 0.25rem 0.5rem 0.25rem 2rem;
    gap: 0.25rem;
  }

  .pdf-error {
    width: 100%;
    font-size: 0.72rem;
    color: var(--danger);
    padding-left: 0.1rem;
  }

  .new-file-input {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.2rem 0.4rem;
    font-size: 0.85rem;
    outline: none;
    min-width: 0;
  }

  .new-file-input:focus {
    border-color: var(--arcane);
  }

  .confirm-btn {
    background: none;
    border: none;
    color: var(--green);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0 0.2rem;
  }

  .spell-search-row {
    padding: 0.3rem 0.75rem 0.2rem;
  }

  .spell-search-input {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.2rem 0.5rem;
    font-size: 0.82rem;
    outline: none;
    font-family: inherit;
  }

  .spell-search-input:focus {
    border-color: var(--arcane);
  }

  .spell-search-input::placeholder {
    color: var(--border);
  }
</style>
