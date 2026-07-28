<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount, untrack } from 'svelte';
  import { PDFDocument } from 'pdf-lib';
  import DragonMark from './DragonMark.svelte';
  import VaultTransferModal from './VaultTransferModal.svelte';
  import CharacterUpgradeModal from './CharacterUpgradeModal.svelte';
  import LibraryManager from './LibraryManager.svelte';
  import { activeCampaign, activeFile, setFileContent, vaultVersion, newItemDraft } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import { confirmAction } from '../stores/confirmDialog';
  import { pushError } from '../stores/errors';
  import { updateState, updateDialogOpen } from '../stores/update';
  import { libraries, libraryManagerOpen, updateCount } from '../stores/libraries';
  import CreateCardModal from './CreateCardModal.svelte';
  import { searchMonsters, searchSpells, mapApiResourceToMonster, mapApiResourceToSpell, searchDndApiItems, mapApiResourceToItem } from '../services/dndApi';
  import { createMonsterAction } from '../services/aiActions/monsterAction';
  import { createSpellAction } from '../services/aiActions/spellAction';
  import { createItemAction } from '../services/aiActions/itemAction';
  import { parseMonster, normalizeItem } from '../utils/schemaValidation';
  import { ensureCharacterJson } from '../pdf/characterImport';
  import { getSpellLibrary, searchSpells as searchSpellLib, loadSpellByPath } from '../spellLibrary';
  import type { Monster, Spell, Item } from '../types';
  import { loadActSummaries, loadEncounterContext, loadCampaignContent } from '../stores/context';
  import type { Campaign, FileEntry } from '../types';
  import { MONSTER_TEMPLATE as monsterTemplate, monsterTypeLabel } from '../types';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { parseCharacterData, emptySpells, emptyPersonal, emptyProficiencies, type CharacterJSON } from '../pdf/characterFields';
  import { CHARACTER_VERSION } from '../schemas/character';
  import {
    ITEMS_PATH,
    CATEGORY_LABELS as ITEM_CAT_LABELS,
    rarityColor,
    invalidateItemCache,
    getItemsByDir,
    searchItems,
    displayName as itemDisplayName,
    blankItem,
    dirOf as itemDirOf,
    toHomebrewCopy,
  } from '../itemLibrary';
  import { SCHOOL_COLORS } from '../spellLibrary';
  import { getClasses, getClassTree, searchClasses, classDisplayName, invalidateClassCache, type ClassNode } from '../classLibrary';
  import { getSpeciesList, searchSpecies, speciesDisplayName, invalidateSpeciesCache, type SpeciesInfo } from '../speciesLibrary';
  import { getFeats, searchFeats, featDisplayName, invalidateFeatsCache, type FeatEntry } from '../featsLibrary';
  import { getBackgroundsList, searchBackgrounds, backgroundDisplayName, invalidateBackgroundsCache, type BackgroundInfo } from '../backgroundsLibrary';
  import {
    listClasses, getClass, listSpecies, getSpecies as getSpeciesRaw, listFeats, getFeat as getFeatRaw,
    listBackgrounds, getBackground as getBackgroundRaw, DEFAULT_DOCUMENT,
  } from '../services/open5eApi';
  import { mapV2 } from '../services/classProgression';
  import { mapV2Species } from '../services/speciesData';
  import { mapV2Feat } from '../services/featData';
  import { mapV2Background } from '../services/backgroundData';
  import { parseClass, parseSpecies, parseFeat, parseBackground } from '../utils/schemaValidation';
  import { CLASS_TEMPLATE, SPECIES_TEMPLATE, FEAT_TEMPLATE, BACKGROUND_TEMPLATE } from '../types';
  import { OWN_SOURCE } from '../schemas/shared';
  import type { ClassProgression, Species, Feat, Background } from '../types';
  import type { DndApiRef } from '../services/dndApi';

  interface EntryInfo { name: string; is_dir: boolean; }

  const VAULT_BASE = './vault/campaigns';
  const CHARACTERS_PATH = './vault/characters';
  const MONSTERS_PATH = './vault/monsters';
  const SPELLS_PATH = './vault/spells';

  // Grad-Badge: Hue = Schulfarbe (Zugehörigkeit), Helligkeit = Grad (Intensität).
  // Grad 0 (Zaubertrick) leicht aufgehellt = schwächster, Grad 9 am dunkelsten = intensivster.
  const spellBadgeColor = (baseColor: string, level: number): string => {
    if (level <= 0) return `color-mix(in srgb, ${baseColor} 78%, white)`;
    const darken = Math.min((level - 1) * 6, 48); // 0 % (Grad 1) … 48 % Schwarz (Grad 9)
    return `color-mix(in srgb, ${baseColor}, black ${darken}%)`;
  };

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

  /**
   * Löscht einen Vault-Eintrag (Datei oder Ordner) nach Bestätigung und ruft die
   * passende Reload-Funktion. Räumt activeFile auf, falls der gelöschte Eintrag
   * (oder ein Kind davon) gerade geöffnet ist.
   */
  async function deleteEntry(
    path: string,
    displayName: string,
    isFolder: boolean,
    reload: () => void | Promise<void>,
  ): Promise<void> {
    const ok = await confirmAction({
      title: 'Löschen',
      message: isFolder
        ? `„${displayName}" und der gesamte enthaltene Inhalt werden unwiderruflich gelöscht.`
        : `„${displayName}" wird unwiderruflich gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke('delete_path', { path });
    } catch (e) {
      pushError(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    // activeFile leeren, wenn der gelöschte Pfad (oder ein Unterpfad) offen ist
    const af = get(activeFile);
    const affected = (p?: string) => !!p && (p === path || p.startsWith(path + '/'));
    if (af && (affected(af.path) || affected(af.dirPath))) {
      activeFile.set(null);
      setFileContent('');
    }
    await reload();
    vaultVersion.update((v) => v + 1);
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
    if (classesExpanded) await loadClasses();
    if (speciesExpanded) await loadSpeciesList();
    if (featsExpanded) await loadFeats();
    if (backgroundsExpanded) await loadBackgroundsList();
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
  let pdfImporting = $state(false);
  let pdfImportError = $state('');
  // Stapel-Upgrade der Charakter-Dateien auf CHARACTER_VERSION (services/characterUpgrade.ts).
  let showCharacterUpgrade = $state(false);

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
    const raw = newCharInput.trim();
    if (!raw) return;

    const slug = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_äöü]/g, '');
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const dirPath = `${CHARACTERS_PATH}/${slug}`;

    const json: CharacterJSON = {
      // Neu in der App entstanden → schon im aktuellen Format, kein Upgrade nötig.
      _version: CHARACTER_VERSION,
      name,
      classes: [],
      classLevel: '', playerName: '',
      backgroundRef: { sourceKey: '', name: '' }, background: '',
      species: { sourceKey: '', name: '' }, race: '', xp: '',
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
      personal: emptyPersonal(),
      proficiencies: emptyProficiencies(),
      masteries: [],
      references: { feats: [] },
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
        // BEWUSST v1: das PDF liefert Klasse/Volk/Hintergrund als Freitext. Die
        // Upgrade-Pipeline (schemas/character.ts) strukturiert das beim ersten Laden.
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
  // group → { filename, name, cr }[]
  let monsterGroups: Record<string, { filename: string; name: string; cr: string }[]> = $state({});
  let openMonsterGroups: Record<string, boolean> = $state({});

  async function loadMonsters() {
    try {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: MONSTERS_PATH });
      const dirs = entries.filter((e) => e.is_dir).map((e) => e.name);
      const rootFiles = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => e.name);

      async function loadEntry(path: string, relFilename: string): Promise<{ filename: string; name: string; typeKey: string; cr: string }> {
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          return { filename: relFilename, name: data.name ?? relFilename.replace('.json', ''), typeKey: data.type ?? '', cr: (data.cr ?? '').toString().trim() };
        } catch { return { filename: relFilename, name: relFilename.replace('.json', ''), typeKey: '', cr: '' }; }
      }

      const allEntries: { filename: string; name: string; typeKey: string; cr: string }[] = [];
      for (const dir of dirs) {
        const files = await invoke<string[]>('list_json_files', { path: `${MONSTERS_PATH}/${dir}` }).catch(() => [] as string[]);
        allEntries.push(...await Promise.all(files.map((f) => loadEntry(`${MONSTERS_PATH}/${dir}/${f}`, `${dir}/${f}`))));
      }
      allEntries.push(...await Promise.all(rootFiles.map((f) => loadEntry(`${MONSTERS_PATH}/${f}`, f))));

      const newGroups: Record<string, { filename: string; name: string; cr: string }[]> = {};
      for (const e of allEntries) {
        const key = e.typeKey || 'unknown';
        if (!newGroups[key]) newGroups[key] = [];
        newGroups[key].push({ filename: e.filename, name: e.name, cr: e.cr });
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

  async function createMonster() {
    if (!(await confirmNavigation())) return;
    monstersExpanded = true;
    createModal = 'monster';
  }

  // --- Zauber (global, nach Schule) ---
  let spellsExpanded = $state(false);
  let spellSchools: string[] = $state([]);
  let spellsBySchool: Record<string, { filename: string; name: string; level: number }[]> = $state({});
  let openSpellSchools: Record<string, boolean> = $state({});
  let spellSearch = $state('');
  // Gruppierung der Zauber-Navi: nach Schule (Standard) oder nach Grad.
  let spellGroupBy = $state<'school' | 'level'>('school');
  let openSpellLevels: Record<number, boolean> = $state({});

  // Suche ODER Grad-Gruppierung brauchen alle Schulen geladen.
  $effect(() => {
    const needAll = spellSearch.trim() || (spellsExpanded && spellGroupBy === 'level');
    if (needAll && spellSchools.length) {
      for (const school of spellSchools) {
        if (!spellsBySchool[school]) loadSpellSchool(school);
      }
    }
  });

  // Alle geladenen Zauber nach Grad (0–9) gruppiert; Schule bleibt am Eintrag erhalten.
  let spellsByLevel = $derived.by(() => {
    const groups: Record<number, { school: string; filename: string; name: string; level: number }[]> = {};
    for (const school of spellSchools) {
      for (const spell of spellsBySchool[school] ?? []) {
        (groups[spell.level] ??= []).push({ school, ...spell });
      }
    }
    for (const lvl of Object.keys(groups)) {
      groups[+lvl].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }
    return groups;
  });
  let spellLevels = $derived(Object.keys(spellsByLevel).map(Number).sort((a, b) => a - b));

  let spellSearchResults = $derived.by(() => {
    const q = spellSearch.trim().toLowerCase();
    if (!q) return null;
    const results: { school: string; filename: string; name: string; level: number }[] = [];
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
            return { filename: f, name: data.name ?? f.replace('.json', ''), level: data.level ?? 0 };
          } catch {
            return { filename: f, name: f.replace('.json', ''), level: 0 };
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

  function toggleSpellLevel(level: number) {
    openSpellLevels[level] = !openSpellLevels[level];
  }

  async function openSpell(school: string, filename: string) {
    if (!(await confirmNavigation())) return;
    const path = `${SPELLS_PATH}/${school}/${filename}`;
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'spell' });
  }

  async function createSpell() {
    if (!(await confirmNavigation())) return;
    spellsExpanded = true;
    createModal = 'spell';
  }

  // Welches Create-Modal offen ist (Monster/Zauber via DnD-API + optionaler KI,
  // Klasse/Spezies via Open5e v2).
  let createModal = $state<'monster' | 'spell' | 'class' | 'species' | 'feat' | 'background' | null>(null);

  function blankSpell(name: string): Spell {
    return {
      name: name || 'Neuer Zauber', level: 1, school: 'evocation',
      casting_time: '1 Aktion', range: '9 Meter',
      components: { verbal: true, somatic: false, material: false, materials_needed: null },
      duration: 'Unmittelbar', concentration: false, ritual: false,
      classes: [], desc: [''], source: OWN_SOURCE,
    };
  }

  // ── Vorlagensuche (Bibliothek) für die Create-Modals ─────────────────────────
  async function searchSpellLibrary(q: string): Promise<{ name: string; load: () => Promise<Spell> }[]> {
    const lib = await getSpellLibrary();
    return searchSpellLib(lib, q, null, '', 8).map((s) => ({
      name: s.spell.name,
      load: async () => (await loadSpellByPath(s.spell.path)) ?? blankSpell(s.spell.name),
    }));
  }

  // Alle Vault-Monster (Name + Loader) einmal einlesen und cachen.
  let monsterLibCache: { name: string; load: () => Promise<Monster> }[] | null = null;
  async function searchMonsterLibrary(q: string): Promise<{ name: string; load: () => Promise<Monster> }[]> {
    if (!monsterLibCache) {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: MONSTERS_PATH });
      const paths = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => `${MONSTERS_PATH}/${e.name}`);
      for (const d of entries.filter((e) => e.is_dir)) {
        const files = await invoke<string[]>('list_json_files', { path: `${MONSTERS_PATH}/${d.name}` }).catch(() => [] as string[]);
        paths.push(...files.map((f) => `${MONSTERS_PATH}/${d.name}/${f}`));
      }
      const loaded = await Promise.all(paths.map(async (path) => {
        try {
          const r = parseMonster(JSON.parse(await invoke<string>('read_file_content', { path })));
          return r.ok ? { name: r.data.name, load: async () => r.data } : null;
        } catch { return null; }
      }));
      monsterLibCache = loaded.filter((x): x is { name: string; load: () => Promise<Monster> } => x !== null);
    }
    const ql = q.toLowerCase();
    return monsterLibCache.filter((h) => h.name.toLowerCase().includes(ql)).slice(0, 8);
  }

  // ── Item-Vorlagensuche + API-Mapping für das Create-Modal ────────────────────
  async function searchItemLibrary(q: string): Promise<{ name: string; load: () => Promise<Item> }[]> {
    const entries = await Promise.all(itemDirs.map(async (d) => [d, await getItemsByDir(d)] as const));
    const libByDir = Object.fromEntries(entries);
    return searchItems(libByDir, q, 8).map((s) => ({
      name: itemDisplayName(s.item),
      load: async () =>
        toHomebrewCopy(normalizeItem(JSON.parse(await invoke<string>('read_file_content', { path: s.item.path })))),
    }));
  }

  /** Rohe SRD-Ressource → Homebrew-Item (Quelle aus rarity-Präsenz abgeleitet). */
  function mapApiItem(data: Record<string, unknown>): Item {
    return toHomebrewCopy(mapApiResourceToItem(data, data.rarity ? 'magic' : 'equipment'));
  }

  // --- Gegenstände (global, nach Kategorie) ---
  // Anzeige-Labels kommen direkt aus ITEM_CAT_LABELS (dir === category).

  let itemsExpanded = $state(false);
  let itemDirs: string[] = $state([]);
  let itemsByDir: Record<string, { filename: string; name: string; rarity?: string }[]> = $state({});
  let openItemDirs: Record<string, boolean> = $state({});
  let itemSearch = $state('');
  let showItemModal = $state(false);
  let showTransferModal = $state(false);
  /** Anzahl Bibliotheken mit Update — hebt den Bibliotheks-Knopf hervor. */
  let libUpdates = $derived(updateCount($libraries));

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
    const results: { dir: string; filename: string; name: string; rarity?: string }[] = [];
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
            return { filename: f, name: data.name_de ?? data.name ?? f.replace('.json', ''), rarity: data.rarity?.name ?? '' };
          } catch {
            return { filename: f, name: f.replace('.json', ''), rarity: '' };
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
    if (!(await confirmNavigation())) return;
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

  // --- Klassen (globale Regel-Bibliothek, Basisklassen mit Subklassen als Unterpunkte) ---
  let classesExpanded = $state(false);
  let classTree = $state<ClassNode[]>([]);

  async function loadClasses() {
    invalidateClassCache();
    classTree = await getClassTree();
  }

  async function toggleClasses() {
    classesExpanded = !classesExpanded;
    if (classesExpanded) await loadClasses();
  }

  async function openClass(path: string) {
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'class' });
  }

  async function createClass() {
    if (!(await confirmNavigation())) return;
    classesExpanded = true;
    createModal = 'class';
  }

  function blankClass(name: string): ClassProgression {
    return { ...structuredClone(CLASS_TEMPLATE), name: name || 'Neue Klasse', nameDe: name || 'Neue Klasse' };
  }

  /** Open5e-v2-Suche über Basisklassen UND Subklassen. ref.url = v2-Key. */
  async function searchOpen5eClasses(q: string): Promise<DndApiRef[]> {
    const all = await listClasses();
    const ql = q.toLowerCase();
    return all
      .filter((c) => c.name.toLowerCase().includes(ql))
      .map((c) => ({
        index: c.key,
        name: c.subclass_of?.name ? `${c.name} — Unterklasse von ${c.subclass_of.name}` : c.name,
        url: c.key,
      }))
      .slice(0, 15);
  }
  const loadOpen5eClass = async (ref: DndApiRef): Promise<ClassProgression> => mapV2(await getClass(ref.url));

  async function searchClassLibrary(q: string): Promise<{ name: string; load: () => Promise<ClassProgression> }[]> {
    const lib = await getClasses();
    return searchClasses(lib, q, 8).map((c) => ({
      name: classDisplayName(c),
      load: async () => {
        const r = parseClass(JSON.parse(await invoke<string>('read_file_content', { path: c.path })));
        return r.ok ? r.data : blankClass(classDisplayName(c));
      },
    }));
  }

  // --- Spezies (globale Regel-Bibliothek, flach) ---
  let speciesExpanded = $state(false);
  let speciesInfos = $state<SpeciesInfo[]>([]);

  async function loadSpeciesList() {
    invalidateSpeciesCache();
    speciesInfos = await getSpeciesList();
  }

  async function toggleSpecies() {
    speciesExpanded = !speciesExpanded;
    if (speciesExpanded) await loadSpeciesList();
  }

  async function openSpecies(path: string) {
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'species' });
  }

  async function createSpecies() {
    if (!(await confirmNavigation())) return;
    speciesExpanded = true;
    createModal = 'species';
  }

  function blankSpecies(name: string): Species {
    return { ...structuredClone(SPECIES_TEMPLATE), name: name || 'Neue Spezies', nameDe: name || 'Neue Spezies' };
  }

  /** Open5e-v2-Spezies-Suche. ref.url = v2-Key. */
  async function searchOpen5eSpecies(q: string): Promise<DndApiRef[]> {
    const all = await listSpecies();
    const ql = q.toLowerCase();
    return all
      .filter((s) => s.name.toLowerCase().includes(ql))
      .map((s) => ({ index: s.key, name: s.name, url: s.key }))
      .slice(0, 15);
  }
  const loadOpen5eSpecies = async (ref: DndApiRef): Promise<Species> => mapV2Species(await getSpeciesRaw(ref.url));

  async function searchSpeciesLibrary(q: string): Promise<{ name: string; load: () => Promise<Species> }[]> {
    const lib = await getSpeciesList();
    return searchSpecies(lib, q, 8).map((s) => ({
      name: speciesDisplayName(s),
      load: async () => {
        const r = parseSpecies(JSON.parse(await invoke<string>('read_file_content', { path: s.path })));
        return r.ok ? r.data : blankSpecies(speciesDisplayName(s));
      },
    }));
  }

  // --- Talente (globale Regel-Bibliothek, flach) ---
  let featsExpanded = $state(false);
  let featInfos = $state<FeatEntry[]>([]);

  async function loadFeats() {
    invalidateFeatsCache();
    featInfos = await getFeats();
  }

  async function toggleFeats() {
    featsExpanded = !featsExpanded;
    if (featsExpanded) await loadFeats();
  }

  async function openFeat(path: string) {
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'feat' });
  }

  async function createFeat() {
    if (!(await confirmNavigation())) return;
    featsExpanded = true;
    createModal = 'feat';
  }

  function blankFeat(name: string): Feat {
    return { ...structuredClone(FEAT_TEMPLATE), name: name || 'Neues Talent', nameDe: name || 'Neues Talent' };
  }

  /** Open5e-v2-Talent-Suche. ref.url = v2-Key. */
  async function searchOpen5eFeats(q: string): Promise<DndApiRef[]> {
    const all = await listFeats();
    const ql = q.toLowerCase();
    return all
      .filter((f) => f.name.toLowerCase().includes(ql))
      .map((f) => ({ index: f.key, name: f.name, url: f.key }))
      .slice(0, 15);
  }
  const loadOpen5eFeat = async (ref: DndApiRef): Promise<Feat> => mapV2Feat(await getFeatRaw(ref.url));

  async function searchFeatLibrary(q: string): Promise<{ name: string; load: () => Promise<Feat> }[]> {
    const lib = await getFeats();
    return searchFeats(lib, q, 8).map((f) => ({
      name: featDisplayName(f),
      load: async () => {
        if (!f.path) return blankFeat(featDisplayName(f));
        const r = parseFeat(JSON.parse(await invoke<string>('read_file_content', { path: f.path })));
        return r.ok ? r.data : blankFeat(featDisplayName(f));
      },
    }));
  }

  // --- Hintergründe (globale Regel-Bibliothek, flach) ---
  let backgroundsExpanded = $state(false);
  let backgroundInfos = $state<BackgroundInfo[]>([]);

  async function loadBackgroundsList() {
    invalidateBackgroundsCache();
    backgroundInfos = await getBackgroundsList();
  }

  async function toggleBackgrounds() {
    backgroundsExpanded = !backgroundsExpanded;
    if (backgroundsExpanded) await loadBackgroundsList();
  }

  async function openBackground(path: string) {
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'background' });
  }

  async function createBackground() {
    if (!(await confirmNavigation())) return;
    backgroundsExpanded = true;
    createModal = 'background';
  }

  function blankBackground(name: string): Background {
    return { ...structuredClone(BACKGROUND_TEMPLATE), name: name || 'Neuer Hintergrund', nameDe: name || 'Neuer Hintergrund' };
  }

  /**
   * Open5e-v2-Hintergrund-Suche. ref.url = v2-Key.
   * Die 2024-Quellen zuerst: nur 4 der ~58 Einträge sind SRD 5.2, der Rest ist
   * 2014-/A5E-Material und landet beim Import als `homebrew-sam`.
   */
  async function searchOpen5eBackgrounds(q: string): Promise<DndApiRef[]> {
    const all = await listBackgrounds();
    const ql = q.toLowerCase();
    return all
      .filter((b) => b.name.toLowerCase().includes(ql))
      .sort((a, b) => Number(b.document?.key === DEFAULT_DOCUMENT) - Number(a.document?.key === DEFAULT_DOCUMENT))
      .map((b) => ({ index: b.key, name: `${b.name} (${b.document?.display_name ?? b.document?.key ?? '?'})`, url: b.key }))
      .slice(0, 15);
  }
  const loadOpen5eBackground = async (ref: DndApiRef): Promise<Background> =>
    mapV2Background(await getBackgroundRaw(ref.url));

  async function searchBackgroundLibrary(q: string): Promise<{ name: string; load: () => Promise<Background> }[]> {
    const lib = await getBackgroundsList();
    return searchBackgrounds(lib, q, 8).map((b) => ({
      name: backgroundDisplayName(b),
      load: async () => {
        const r = parseBackground(JSON.parse(await invoke<string>('read_file_content', { path: b.path })));
        return r.ok ? r.data : blankBackground(backgroundDisplayName(b));
      },
    }));
  }

  // Klassen/Spezies/Talente/Hintergründe bei Vault-Änderung neu laden (z.B. nach Speichern eines neuen Eintrags).
  $effect(() => {
    const _v = $vaultVersion;
    if (classesExpanded) void loadClasses();
  });
  $effect(() => {
    const _v = $vaultVersion;
    if (speciesExpanded) void loadSpeciesList();
  });
  $effect(() => {
    const _v = $vaultVersion;
    if (featsExpanded) void loadFeats();
  });
  $effect(() => {
    const _v = $vaultVersion;
    if (backgroundsExpanded) void loadBackgroundsList();
  });

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

  // Öffnet eine Datei (z.B. via Link-Navigation) → die zugehörige Sektion im Baum
  // aufklappen, damit der aktive Eintrag sichtbar/markiert ist. Reagiert nur auf den
  // Pfad-Wechsel (untrack verhindert ein Re-Expandieren, wenn der Nutzer manuell
  // zuklappt). Encounters erscheinen automatisch, sobald die Akte-Sektion geladen ist.
  $effect(() => {
    const path = $activeFile?.path;
    if (!path) return;
    // Globale Charaktere (kampagnenunabhängig)
    if (path.startsWith(`${CHARACTERS_PATH}/`)) {
      untrack(() => {
        if (!charactersExpanded) { charactersExpanded = true; loadCharacters(); }
      });
      return;
    }
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

<!-- Hover-Löschbutton für eine Baumzeile; in `.entry-row` neben den .file-entry-Button gesetzt. -->
{#snippet delBtn(onDelete: () => void)}
  <button class="entry-del" title="Löschen" onclick={(e) => { e.stopPropagation(); onDelete(); }}>🗑</button>
{/snippet}

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

  <!-- Charaktere (global) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleCharacters}>
        <span class="arrow" class:open={charactersExpanded}>›</span>
        Charaktere
      </button>
      <button class="add-btn" title="Charaktere auf die aktuelle Schemaversion ziehen" onclick={() => (showCharacterUpgrade = true)}>
        ⬆
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
              {@render delBtn(() => deleteEntry(`${CHARACTERS_PATH}/${entry.name}`, entry.name.replace('.md', ''), entry.is_dir, loadCharacters))}
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

  <!-- Monster (global) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleMonsters}>
        <span class="arrow" class:open={monstersExpanded}>›</span>
        Monster
      </button>
      <button class="add-btn" title="Neues Monster" onclick={createMonster}>
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
              {#each monsters as { filename, name, cr }}
                <div class="entry-row">
                  <button
                    class="file-entry monster-subentry"
                    class:active={$activeFile?.path?.endsWith(filename)}
                    onclick={() => openMonster(filename)}
                  >
                    {#if cr}<span class="monster-cr-badge" title="Herausforderungsgrad {cr}">{cr}</span>{/if}
                    {name}
                  </button>
                  {@render delBtn(() => deleteEntry(`${MONSTERS_PATH}/${filename}`, name, false, loadMonsters))}
                </div>
              {/each}
            {/if}
          {/each}
        {:else}
          <span class="empty">Keine Monster</span>
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
      <button class="add-btn" title="Neuer Zauber" onclick={createSpell}>
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
      <div class="spell-group-toggle">
        <button class:active={spellGroupBy === 'school'} onclick={() => (spellGroupBy = 'school')}>Schule</button>
        <button class:active={spellGroupBy === 'level'} onclick={() => (spellGroupBy = 'level')}>Grad</button>
      </div>
      <div class="file-list">
        {#if spellSearchResults !== null}
          <!-- Suchergebnisse (flach) -->
          {#if spellSearchResults.length}
            {#each spellSearchResults as { school, filename, name, level }}
              {@const badgeColor = SCHOOL_COLORS[SCHOOL_DIR_TO_KEY[school]] ?? 'var(--ink-muted)'}
              <div class="entry-row">
                <button
                  class="file-entry monster-subentry"
                  class:active={$activeFile?.path?.includes(`/${school}/${filename}`)}
                  onclick={() => openSpell(school, filename)}
                  title={school}
                >
                  <span class="spell-level-badge" style="background: {spellBadgeColor(badgeColor, level)}" title={level === 0 ? 'Zaubertrick' : `Grad ${level}`}>{level === 0 ? 'Z' : level}</span>
                  {name}
                </button>
                {@render delBtn(() => deleteEntry(`${SPELLS_PATH}/${school}/${filename}`, name, false, () => loadSpellSchool(school)))}
              </div>
            {/each}
          {:else}
            <span class="empty">Keine Treffer</span>
          {/if}
        {:else if !spellSchools.length}
          <span class="empty">Keine Zauber</span>
        {:else if spellGroupBy === 'school'}
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
                {#each spells as { filename, name, level }}
                  <div class="entry-row">
                    <button
                      class="file-entry monster-subentry"
                      class:active={$activeFile?.path?.includes(`/${school}/${filename}`)}
                      onclick={() => openSpell(school, filename)}
                    >
                      <span class="spell-level-badge" style="background: {spellBadgeColor(color, level)}" title={level === 0 ? 'Zaubertrick' : `Grad ${level}`}>{level === 0 ? 'Z' : level}</span>
                      {name}
                    </button>
                    {@render delBtn(() => deleteEntry(`${SPELLS_PATH}/${school}/${filename}`, name, false, () => loadSpellSchool(school)))}
                  </div>
                {/each}
              {:else}
                <span class="empty">Laden…</span>
              {/if}
            {/if}
          {/each}
        {:else if spellLevels.length}
          <!-- Gruppierte Ansicht nach Grad -->
          {#each spellLevels as level}
            {@const spells = spellsByLevel[level]}
            <button
              class="monster-group-header"
              onclick={() => toggleSpellLevel(level)}
            >
              <span class="arrow" class:open={openSpellLevels[level]}>›</span>
              <span class="spell-level-badge" style="background: {spellBadgeColor('var(--ink-muted)', level)}">{level === 0 ? 'Z' : level}</span>
              {level === 0 ? 'Zaubertricks' : `Grad ${level}`}
              <span class="group-count">({spells.length})</span>
            </button>
            {#if openSpellLevels[level]}
              {#each spells as { school, filename, name }}
                {@const color = SCHOOL_COLORS[SCHOOL_DIR_TO_KEY[school]] ?? 'var(--ink)'}
                <div class="entry-row">
                  <button
                    class="file-entry monster-subentry"
                    class:active={$activeFile?.path?.includes(`/${school}/${filename}`)}
                    onclick={() => openSpell(school, filename)}
                    title={school}
                  >
                    <span class="spell-level-badge" style="background: {spellBadgeColor(color, level)}" title={school}>{level === 0 ? 'Z' : level}</span>
                    {name}
                  </button>
                  {@render delBtn(() => deleteEntry(`${SPELLS_PATH}/${school}/${filename}`, name, false, () => loadSpellSchool(school)))}
                </div>
              {/each}
            {/if}
          {/each}
        {:else}
          <span class="empty">Laden…</span>
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
            {#each itemSearchResults as { dir, filename, name, rarity }}
              <div class="entry-row">
                <button
                  class="file-entry monster-subentry"
                  class:active={$activeFile?.path?.includes(`/${dir}/${filename}`)}
                  onclick={() => openItem(dir, filename)}
                  title={dir}
                >
                  <span class="rarity-dot" style="background:{rarityColor(rarity)}"></span>{name}
                </button>
                {@render delBtn(() => deleteEntry(`${ITEMS_PATH}/${dir}/${filename}`, name, false, () => { invalidateItemCache(dir); return loadItemDir(dir); }))}
              </div>
            {/each}
          {:else}
            <span class="empty">Keine Treffer</span>
          {/if}
        {:else if itemDirs.length}
          {#each itemDirs as dir}
            {@const dirItems = itemsByDir[dir]}
            <button
              class="monster-group-header item-group-header"
              onclick={() => toggleItemDir(dir)}
            >
              <span class="arrow" class:open={openItemDirs[dir]}>›</span>
              {ITEM_CAT_LABELS[dir] ?? dir}
              {#if dirItems}<span class="group-count">({dirItems.length})</span>{/if}
            </button>
            {#if openItemDirs[dir]}
              {#if dirItems}
                {#each dirItems as { filename, name, rarity }}
                  <div class="entry-row">
                    <button
                      class="file-entry monster-subentry"
                      class:active={$activeFile?.path?.includes(`/${dir}/${filename}`)}
                      onclick={() => openItem(dir, filename)}
                    >
                      <span class="rarity-dot" style="background:{rarityColor(rarity)}"></span>{name}
                    </button>
                    {@render delBtn(() => deleteEntry(`${ITEMS_PATH}/${dir}/${filename}`, name, false, () => { invalidateItemCache(dir); return loadItemDir(dir); }))}
                  </div>
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

  <!-- Klassen (globale Regel-Bibliothek) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleClasses}>
        <span class="arrow" class:open={classesExpanded}>›</span>
        Klassen
      </button>
      <button class="add-btn" title="Neue Klasse" onclick={createClass}>+</button>
    </div>

    {#if classesExpanded}
      <div class="file-list">
        {#if classTree.length}
          {#each classTree as node}
            <div class="entry-row">
              <button
                class="file-entry lib-entry"
                class:active={$activeFile?.path === node.path}
                onclick={() => openClass(node.path)}
              >
                📖 {classDisplayName(node)}
              </button>
              {@render delBtn(() => deleteEntry(node.path, classDisplayName(node), false, loadClasses))}
            </div>
            {#each node.subclasses as sub}
              <div class="entry-row">
                <button
                  class="file-entry class-subentry"
                  class:active={$activeFile?.path === sub.path}
                  onclick={() => openClass(sub.path)}
                >
                  ↳ {classDisplayName(sub)}
                </button>
                {@render delBtn(() => deleteEntry(sub.path, classDisplayName(sub), false, loadClasses))}
              </div>
            {/each}
          {/each}
        {:else}
          <span class="empty">Keine Klassen</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Spezies (globale Regel-Bibliothek) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleSpecies}>
        <span class="arrow" class:open={speciesExpanded}>›</span>
        Spezies
      </button>
      <button class="add-btn" title="Neue Spezies" onclick={createSpecies}>+</button>
    </div>

    {#if speciesExpanded}
      <div class="file-list">
        {#if speciesInfos.length}
          {#each speciesInfos as info}
            <div class="entry-row">
              <button
                class="file-entry lib-entry"
                class:active={$activeFile?.path === info.path}
                onclick={() => openSpecies(info.path)}
              >
                🧬 {speciesDisplayName(info)}
              </button>
              {@render delBtn(() => deleteEntry(info.path, speciesDisplayName(info), false, loadSpeciesList))}
            </div>
          {/each}
        {:else}
          <span class="empty">Keine Spezies</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Talente (globale Regel-Bibliothek) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleFeats}>
        <span class="arrow" class:open={featsExpanded}>›</span>
        Talente
      </button>
      <button class="add-btn" title="Neues Talent" onclick={createFeat}>+</button>
    </div>

    {#if featsExpanded}
      <div class="file-list">
        {#if featInfos.length}
          {#each featInfos as info}
            <div class="entry-row">
              <button
                class="file-entry lib-entry"
                class:active={$activeFile?.path === info.path}
                onclick={() => info.path && openFeat(info.path)}
              >
                ✴ {featDisplayName(info)}
              </button>
              {#if info.path}
                {@render delBtn(() => deleteEntry(info.path!, featDisplayName(info), false, loadFeats))}
              {/if}
            </div>
          {/each}
        {:else}
          <span class="empty">Keine Talente</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Hintergründe (globale Regel-Bibliothek) -->
  <div class="top-section">
    <div class="section-row">
      <button class="section-toggle chars-toggle" onclick={toggleBackgrounds}>
        <span class="arrow" class:open={backgroundsExpanded}>›</span>
        Hintergründe
      </button>
      <button class="add-btn" title="Neuer Hintergrund" onclick={createBackground}>+</button>
    </div>

    {#if backgroundsExpanded}
      <div class="file-list">
        {#if backgroundInfos.length}
          {#each backgroundInfos as info}
            <div class="entry-row">
              <button
                class="file-entry lib-entry"
                class:active={$activeFile?.path === info.path}
                onclick={() => openBackground(info.path)}
              >
                🎭 {backgroundDisplayName(info)}
              </button>
              {@render delBtn(() => deleteEntry(info.path, backgroundDisplayName(info), false, loadBackgroundsList))}
            </div>
          {/each}
        {:else}
          <span class="empty">Keine Hintergründe</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if showItemModal}
    <CreateCardModal
      type="item"
      title="Neuer Gegenstand"
      searchApi={searchDndApiItems}
      mapApi={mapApiItem}
      searchLibrary={searchItemLibrary}
      blank={(name) => blankItem(name, itemDirs[0] ?? 'other')}
      buildAction={createItemAction}
      nameOf={(i: Item) => i.name_de || i.name || 'Gegenstand'}
      onCreated={(item: Item) => newItemDraft.set({ item, dir: itemDirOf(item) })}
      onclose={() => (showItemModal = false)}
    />
  {/if}

  {#if $libraryManagerOpen}
    <LibraryManager onclose={() => libraryManagerOpen.set(false)} />
  {/if}

  {#if showTransferModal}
    <VaultTransferModal onclose={() => (showTransferModal = false)} />
  {/if}

  {#if showCharacterUpgrade}
    <CharacterUpgradeModal onclose={() => { showCharacterUpgrade = false; loadCharacters(); }} />
  {/if}

  {#if createModal === 'monster'}
    <CreateCardModal
      type="monster"
      title="Neues Monster"
      searchApi={searchMonsters}
      mapApi={mapApiResourceToMonster}
      searchLibrary={searchMonsterLibrary}
      blank={(name) => ({ ...monsterTemplate, name: name || monsterTemplate.name })}
      buildAction={createMonsterAction}
      nameOf={(m: Monster) => m.name || 'Monster'}
      onclose={() => (createModal = null)}
    />
  {:else if createModal === 'spell'}
    <CreateCardModal
      type="spell"
      title="Neuer Zauber"
      searchApi={searchSpells}
      mapApi={mapApiResourceToSpell}
      searchLibrary={searchSpellLibrary}
      blank={blankSpell}
      buildAction={createSpellAction}
      nameOf={(s: Spell) => s.name || 'Zauber'}
      onclose={() => (createModal = null)}
    />
  {:else if createModal === 'class'}
    <CreateCardModal
      type="class"
      title="Neue Klasse"
      searchApi={searchOpen5eClasses}
      loadApi={loadOpen5eClass}
      searchLibrary={searchClassLibrary}
      blank={blankClass}
      nameOf={(c: ClassProgression) => c.nameDe || c.name || 'Klasse'}
      extraSelect={{
        label: 'Subklasse von',
        placeholder: '— (eigenständige Klasse)',
        load: async () =>
          (await getClasses())
            .filter((c) => !c.subclassOf && c.key)
            .map((c) => ({ value: c.key!, label: classDisplayName(c) })),
        apply: (draft: ClassProgression, value: string) => { draft.subclassOf = value; },
      }}
      onclose={() => (createModal = null)}
    />
  {:else if createModal === 'species'}
    <CreateCardModal
      type="species"
      title="Neue Spezies"
      searchApi={searchOpen5eSpecies}
      loadApi={loadOpen5eSpecies}
      searchLibrary={searchSpeciesLibrary}
      blank={blankSpecies}
      nameOf={(s: Species) => s.nameDe || s.name || 'Spezies'}
      onclose={() => (createModal = null)}
    />
  {:else if createModal === 'feat'}
    <CreateCardModal
      type="feat"
      title="Neues Talent"
      searchApi={searchOpen5eFeats}
      loadApi={loadOpen5eFeat}
      searchLibrary={searchFeatLibrary}
      blank={blankFeat}
      nameOf={(f: Feat) => f.nameDe || f.name || 'Talent'}
      onclose={() => (createModal = null)}
    />
  {:else if createModal === 'background'}
    <CreateCardModal
      type="background"
      title="Neuer Hintergrund"
      searchApi={searchOpen5eBackgrounds}
      loadApi={loadOpen5eBackground}
      searchLibrary={searchBackgroundLibrary}
      blank={blankBackground}
      nameOf={(b: Background) => b.nameDe || b.name || 'Hintergrund'}
      onclose={() => (createModal = null)}
    />
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

  /* Zeile mit Hover-Löschbutton (.file-entry/.campaign-title + .entry-del) */
  .entry-row {
    position: relative;
  }
  .entry-del {
    padding: 0 0.6rem;
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    opacity: 0;
    flex-shrink: 0;
    transition: opacity 0.1s;
  }
  /* In Blatt-Zeilen den Button rechts über die Zeile legen (volle Hover-Breite). */
  .entry-row > .entry-del {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
  }
  .entry-row:hover .entry-del,
  .act-row:hover .entry-del {
    opacity: 1;
  }
  .entry-del:hover {
    color: var(--danger);
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

  /* Item-Gruppen tragen keine Kategoriefarbe — der Farbcode liegt (per Seltenheit) auf den Items. */
  .item-group-header { color: var(--ink-soft); }
  .item-group-header:hover { color: var(--ink); }

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

  /* Bibliothek (Klassen/Spezies/Talente): 1. Ebene ohne Kategorie-Level → flach
     eingerückt wie die 1. Ebene bei Monstern/Gegenständen (spart Platz). */
  .lib-entry {
    padding-left: 1.75rem;
  }

  /* Subklasse als Unterpunkt der Basisklasse: eine Stufe tiefer als .lib-entry, dezent. */
  .class-subentry {
    padding-left: 3rem;
    font-size: 0.9em;
    color: var(--ink-muted);
  }

  /* HG-Badge (Herausforderungsgrad) vor Monster-Einträgen */
  .monster-cr-badge {
    display: inline-block;
    margin-right: 0.4rem;
    padding: 0 0.3rem;
    border-radius: 0.25rem;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: var(--red);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1.05rem;
    vertical-align: middle;
    flex-shrink: 0;
  }

  /* Grad-Badge vor Zauber-Einträgen */
  .spell-level-badge {
    display: inline-block;
    min-width: 1.1rem;
    padding: 0 0.2rem;
    margin-right: 0.4rem;
    border-radius: 0.25rem;
    color: var(--bg);
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
    line-height: 1.15rem;
    vertical-align: middle;
    flex-shrink: 0;
  }

  /* Klassen-Icon + Level-Badge vor Charakter-Einträgen */
  .char-entry {
    padding-left: 1rem;
  }
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

  /* Seltenheits-Punkt vor Item-Einträgen (Farbe = Seltenheit) */
  .rarity-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    margin-right: 0.45rem;
    vertical-align: middle;
    flex-shrink: 0;
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

  /* Umschalter Gruppierung Schule | Grad */
  .spell-group-toggle {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.75rem 0.3rem;
    font-size: 0.72rem;
  }
  .spell-group-toggle button {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    padding: 0.1rem 0.45rem;
    font-size: 0.72rem;
    font-family: inherit;
    cursor: pointer;
  }
  .spell-group-toggle button:hover {
    color: var(--ink);
  }
  .spell-group-toggle button.active {
    background: var(--arcane);
    border-color: var(--arcane);
    color: var(--bg);
  }
</style>
