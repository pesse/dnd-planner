/**
 * Lade-, Anlage- und Navigationszustand des Kampagnenbaums: Kampagnen, ihre
 * Akt/Sessions/NPC/Welt/Notizen-Sektionen und die Encounter je Akt.
 */
import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
import { onMount } from 'svelte';
import { activeCampaign, activeFile, setFileContent } from '../../../stores/campaign';
import { confirmNavigation } from '../../../stores/navigationGuard';
import { loadActSummaries, loadEncounterContext } from '../../../stores/context';
import type { Campaign, FileEntry } from '../../../types';
import { slugKeepUmlauts, slugToName } from '../../../utils/text';

interface EntryInfo { name: string; is_dir: boolean; }

export const VAULT_BASE = './vault/campaigns';

export type CampaignSection = { label: string; subdir: string; type: FileEntry['type'] };

export const SECTIONS: CampaignSection[] = [
  { label: 'Akte', subdir: 'acts', type: 'act' },
  { label: 'Sessions', subdir: 'sessions', type: 'session' },
  { label: 'NPCs', subdir: 'npcs', type: 'npc' },
  { label: 'Welt', subdir: 'world', type: 'world' },
  { label: 'Notizen', subdir: 'notes', type: 'notes' },
];

export const sectionKeyOf = (campaignPath: string, section: CampaignSection): string => `${campaignPath}/${section.subdir}`;
export const actKeyOf = (campaignPath: string, actDirName: string): string => `${campaignPath}/${actDirName}`;
export const actIndexPath = (campaignPath: string, actDirName: string): string =>
  `${VAULT_BASE}/${campaignPath}/acts/${actDirName}/index.md`;
export const actDirPath = (campaignPath: string, actDirName: string): string =>
  `${VAULT_BASE}/${campaignPath}/acts/${actDirName}`;
export const encounterDirOf = (campaignPath: string, actDirName: string): string =>
  `${actDirPath(campaignPath, actDirName)}/encounters`;
export const encounterPathOf = (campaignPath: string, actDirName: string, filename: string): string =>
  `${encounterDirOf(campaignPath, actDirName)}/${filename}`;
export const sectionEntryPath = (campaignPath: string, section: CampaignSection, filename: string): string =>
  section.type === 'act' ? actIndexPath(campaignPath, filename) : `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;
export const campaignDirPath = (campaignPath: string): string => `${VAULT_BASE}/${campaignPath}`;

async function loadTemplate(type: string): Promise<string | null> {
  const ext = type === 'npc' ? 'json' : 'md';
  try {
    return await invoke<string>('read_file_content', { path: `./vault/templates/${type}.${ext}` });
  } catch {
    return null;
  }
}

export class CampaignTreeState {
  campaigns = $state<Campaign[]>([]);
  showNewCampaignInput = $state(false);
  newCampaignInput = $state('');

  expanded: Record<string, boolean> = $state({});
  sectionFiles: Record<string, string[]> = $state({});
  fileTitles: Record<string, string> = $state({});
  newFileInput: Record<string, string> = $state({});
  showNewFileInput: Record<string, boolean> = $state({});

  encounterFiles: Record<string, string[]> = $state({});
  encounterNames: Record<string, string> = $state({});
  showNewActEncounterInput: Record<string, boolean> = $state({});
  newActEncounterInput: Record<string, string> = $state({});

  constructor() {
    onMount(() => { this.loadCampaigns(); });
  }

  async loadCampaigns(): Promise<void> {
    try {
      const entries = await invoke<EntryInfo[]>('list_entries', { path: VAULT_BASE });
      this.campaigns = entries
        .filter((e) => e.is_dir)
        .map((e, i) => ({ id: String(i), name: slugToName(e.name), path: e.name }));
    } catch {
      this.campaigns = [];
    }
  }

  async reload(): Promise<void> {
    await this.loadCampaigns();
    const campaign = get(activeCampaign);
    if (!campaign) return;
    for (const section of SECTIONS) {
      const key = sectionKeyOf(campaign.path, section);
      if (this.expanded[key]) await this.loadSection(campaign.path, section);
    }
  }

  /** Aktive Kampagne räumen, wenn genau sie gelöscht wurde — sonst zeigt der Bogen ins Leere. */
  async afterDeleteCampaign(campaignPath: string): Promise<void> {
    if (get(activeCampaign)?.path === campaignPath) {
      activeCampaign.set(null);
      activeFile.set(null);
      setFileContent('');
    }
    await this.loadCampaigns();
  }

  async createCampaign(e: KeyboardEvent | MouseEvent): Promise<void> {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = this.newCampaignInput.trim();
    if (!raw) return;

    const slug = slugKeepUmlauts(raw);
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const campaignMd = `${VAULT_BASE}/${slug}/campaign.md`;

    const tmpl = await loadTemplate('campaign');
    const template = `# ${name}\n\n` + (tmpl ?? `## Beschreibung\n\n\n## Hintergrund\n\n\n## Hauptziele\n\n\n## Wichtige Orte\n\n\n## Notizen\n\n`);
    try {
      await invoke('write_file_content', { path: campaignMd, content: template });
      this.showNewCampaignInput = false;
      this.newCampaignInput = '';
      await this.loadCampaigns();
      const newCampaign = this.campaigns.find((c) => c.path === slug);
      if (newCampaign) {
        activeCampaign.set(newCampaign);
        activeFile.set({ name: 'campaign', path: campaignMd, type: 'campaign' });
        setFileContent(template);
      }
    } catch (err) {
      console.error('Kampagne konnte nicht erstellt werden:', err);
    }
  }

  cancelNewCampaign(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.showNewCampaignInput = false; this.newCampaignInput = ''; }
  }

  async loadEncountersForAct(campaignPath: string, actDirName: string): Promise<void> {
    const key = actKeyOf(campaignPath, actDirName);
    const dir = encounterDirOf(campaignPath, actDirName);
    try {
      const files = await invoke<string[]>('list_json_files', { path: dir });
      this.encounterFiles[key] = files;
      files.forEach(async (filename) => {
        const path = `${dir}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          this.encounterNames[`${key}/${filename}`] = data.name ?? filename.replace('.json', '');
        } catch {
          this.encounterNames[`${key}/${filename}`] = filename.replace('.json', '');
        }
      });
    } catch {
      this.encounterFiles[key] = [];
    }
  }

  async openEncounter(campaignPath: string, actDirName: string, filename: string): Promise<void> {
    if (!(await confirmNavigation())) return;
    const path = encounterPathOf(campaignPath, actDirName, filename);
    activeFile.set({ name: filename.replace('.json', ''), path, type: 'encounter' });
    // Inhalt und Monster lädt die EncounterCard selbst.
  }

  async createActEncounter(campaignPath: string, actDirName: string, e: KeyboardEvent | MouseEvent): Promise<void> {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const key = actKeyOf(campaignPath, actDirName);
    const raw = this.newActEncounterInput[key]?.trim();
    if (!raw) return;

    const slug = slugKeepUmlauts(raw);
    const filename = slug + '.json';
    const path = encounterPathOf(campaignPath, actDirName, filename);
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
      this.showNewActEncounterInput[key] = false;
      this.newActEncounterInput[key] = '';
      await this.loadEncountersForAct(campaignPath, actDirName);
      await this.openEncounter(campaignPath, actDirName, filename);
      loadEncounterContext(campaignPath);
    } catch (err) {
      console.error('Encounter konnte nicht erstellt werden:', err);
    }
  }

  cancelNewActEncounter(actKey: string, e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.showNewActEncounterInput[actKey] = false; }
  }

  async loadSection(campaignPath: string, section: CampaignSection): Promise<void> {
    const key = sectionKeyOf(campaignPath, section);
    if (section.type === 'act') {
      try {
        const entries = await invoke<EntryInfo[]>('list_entries', { path: `${VAULT_BASE}/${campaignPath}/acts` });
        const actDirs = entries.filter((e) => e.is_dir).map((e) => e.name);
        this.sectionFiles[key] = actDirs;
        for (const dirName of actDirs) {
          const indexPath = actIndexPath(campaignPath, dirName);
          try {
            const content = await invoke<string>('read_file_content', { path: indexPath });
            const match = content.match(/^#\s+(.+)$/m);
            this.fileTitles[indexPath] = match ? match[1].trim() : dirName;
          } catch {
            this.fileTitles[indexPath] = dirName;
          }
          await this.loadEncountersForAct(campaignPath, dirName);
        }
      } catch {
        this.sectionFiles[key] = [];
      }
    } else if (section.type === 'npc') {
      try {
        const files = await invoke<string[]>('list_json_files', { path: `${VAULT_BASE}/${campaignPath}/${section.subdir}` });
        this.sectionFiles[key] = files;
        files.forEach(async (filename) => {
          const path = `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;
          try {
            const content = await invoke<string>('read_file_content', { path });
            const data = JSON.parse(content);
            this.fileTitles[path] = (data.name as string) || filename.replace('.json', '');
          } catch {
            this.fileTitles[path] = filename.replace('.json', '');
          }
        });
      } catch {
        this.sectionFiles[key] = [];
      }
    } else {
      try {
        const files = await invoke<string[]>('list_directory', { path: `${VAULT_BASE}/${campaignPath}/${section.subdir}` });
        this.sectionFiles[key] = files;
        files.forEach(async (filename) => {
          const path = `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;
          try {
            const content = await invoke<string>('read_file_content', { path });
            const match = content.match(/^#\s+(.+)$/m);
            this.fileTitles[path] = match ? match[1].trim() : filename.replace('.md', '');
          } catch {
            this.fileTitles[path] = filename.replace('.md', '');
          }
        });
      } catch {
        this.sectionFiles[key] = [];
      }
    }
  }

  async toggleSection(campaignPath: string, section: CampaignSection): Promise<void> {
    const key = sectionKeyOf(campaignPath, section);
    this.expanded[key] = !this.expanded[key];
    if (this.expanded[key]) await this.loadSection(campaignPath, section);
  }

  async openFile(campaignPath: string, section: CampaignSection, filenameOrDir: string): Promise<void> {
    if (!(await confirmNavigation())) return;
    const fullPath = sectionEntryPath(campaignPath, section, filenameOrDir);
    const displayName = filenameOrDir.replace(/\.(md|json)$/, '');
    activeFile.set({ name: displayName, path: fullPath, type: section.type });
    try {
      const content = await invoke<string>('read_file_content', { path: fullPath });
      setFileContent(content);
    } catch (e) {
      setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  }

  async selectCampaign(campaign: Campaign): Promise<void> {
    if (!(await confirmNavigation())) return;
    activeCampaign.set({ ...campaign });
    this.openCampaignFile(campaign.path);
  }

  async openCampaignFile(campaignPath: string): Promise<void> {
    const fullPath = `${VAULT_BASE}/${campaignPath}/campaign.md`;
    activeFile.set({ name: 'campaign', path: fullPath, type: 'campaign' });
    try {
      const content = await invoke<string>('read_file_content', { path: fullPath });
      setFileContent(content);
    } catch (e) {
      setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  }

  startNewFile(key: string): void {
    this.showNewFileInput[key] = true;
    this.newFileInput[key] = '';
  }

  async createFile(campaignPath: string, section: CampaignSection, e: KeyboardEvent | MouseEvent): Promise<void> {
    const key = sectionKeyOf(campaignPath, section);
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const raw = this.newFileInput[key]?.trim();
    if (!raw) return;

    const slug = slugKeepUmlauts(raw);
    const title = raw.charAt(0).toUpperCase() + raw.slice(1);

    const isNpc = section.type === 'npc';
    const ext = isNpc ? '.json' : '.md';
    const fullPath = section.type === 'act'
      ? actIndexPath(campaignPath, slug)
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
      this.showNewFileInput[key] = false;
      this.newFileInput[key] = '';
      await this.loadSection(campaignPath, section);
      await this.openFile(campaignPath, section, slug + ext);
      if (section.type === 'act') loadActSummaries(campaignPath);
    } catch (err) {
      console.error('Datei konnte nicht erstellt werden:', err);
    }
  }

  cancelNewFile(key: string, e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.showNewFileInput[key] = false; this.newFileInput[key] = ''; }
  }
}

export function createCampaignTreeState(): CampaignTreeState {
  return new CampaignTreeState();
}
