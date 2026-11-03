/**
 * Lade-, Anlage- und Navigationszustand des Kampagnenbaums: Kampagnen, ihre
 * Akt/Sessions/NPC/Welt/Notizen/Karten-Sektionen und die Encounter je Akt.
 */
import { invoke } from '@tauri-apps/api/core';
import { activeCampaign, invalidateVault } from '../../../stores/campaign';
import { confirmNavigation } from '../../../stores/navigationGuard';
import { navigateTo } from '../../../services/navigation';
import { loadActSummaries, loadEncounterContext } from '../../../stores/context';
import { listActDirs, moveAct } from '../../../services/actOrder';
import { extractActTitle } from '../../../utils/actExtract';
import type { Campaign, FileEntry } from '../../../types';
import { slugKeepUmlauts, slugToName } from '../../../utils/text';
import { npcSchema } from '../../../schemas/npc';
import { encounterSchema } from '../../../schemas/encounter';
import { DOCUMENT_TEMPLATES } from '../../../templates';
import { newBattleMap, serializeBattleMap } from '../../../services/battleMap/mapFiles';
import { instantiateCampaignTemplate, type CampaignTemplateOptions, type CampaignTemplateRef } from '../../../services/templates/templates';
import { MAP_TEMPLATES_SUBDIR } from '../../../services/battleMap/mapTemplates';
import { handoutSchema } from '../../../schemas/handout';

interface EntryInfo { name: string; is_dir: boolean; }

export const VAULT_BASE = './vault/campaigns';

export type CampaignSection = { label: string; subdir: string; type: FileEntry['type'] };

export const SECTIONS: CampaignSection[] = [
  { label: 'Akte', subdir: 'acts', type: 'act' },
  { label: 'Encounter', subdir: 'encounters', type: 'encounter' },
  { label: 'Sessions', subdir: 'sessions', type: 'session' },
  { label: 'NPCs', subdir: 'npcs', type: 'npc' },
  { label: 'Welt', subdir: 'world', type: 'world' },
  { label: 'Notizen', subdir: 'notes', type: 'notes' },
  { label: 'Handouts', subdir: 'handouts', type: 'handout' },
  { label: 'Karten', subdir: 'maps', type: 'map' },
  { label: 'Kartenvorlagen', subdir: MAP_TEMPLATES_SUBDIR, type: 'mapTemplate' },
];

/** Sektionen, deren Einträge JSON-Dateien mit einem `name` sind. */
const JSON_SECTION_TYPES = new Set<FileEntry['type']>(['npc', 'encounter', 'map', 'mapTemplate', 'handout']);

export const sectionKeyOf = (campaignPath: string, section: CampaignSection): string => `${campaignPath}/${section.subdir}`;
export const actKeyOf = (campaignPath: string, actDirName: string): string => `${campaignPath}/${actDirName}`;
export const actsDirPath = (campaignPath: string): string => `${VAULT_BASE}/${campaignPath}/acts`;
export const actIndexPath = (campaignPath: string, actDirName: string): string =>
  `${actsDirPath(campaignPath)}/${actDirName}/index.md`;
export const actDirPath = (campaignPath: string, actDirName: string): string =>
  `${actsDirPath(campaignPath)}/${actDirName}`;
export const encounterDirOf = (campaignPath: string, actDirName: string): string =>
  `${actDirPath(campaignPath, actDirName)}/encounters`;
export const encounterPathOf = (campaignPath: string, actDirName: string, filename: string): string =>
  `${encounterDirOf(campaignPath, actDirName)}/${filename}`;
export const sectionEntryPath = (campaignPath: string, section: CampaignSection, filename: string): string =>
  section.type === 'act' ? actIndexPath(campaignPath, filename) : `${VAULT_BASE}/${campaignPath}/${section.subdir}/${filename}`;

const newEncounterJson = (name: string): string => JSON.stringify(encounterSchema.parse({ name }), null, 2);

export class CampaignTreeState {
  campaigns = $state<Campaign[]>([]);
  showChooser = $state(false);

  expanded: Record<string, boolean> = $state({});
  sectionFiles: Record<string, string[]> = $state({});
  fileTitles: Record<string, string> = $state({});
  newFileInput: Record<string, string> = $state({});
  showNewFileInput: Record<string, boolean> = $state({});

  encounterFiles: Record<string, string[]> = $state({});
  encounterNames: Record<string, string> = $state({});
  showNewActEncounterInput: Record<string, boolean> = $state({});
  newActEncounterInput: Record<string, string> = $state({});

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

  /** @returns false, wenn der Name leer ist oder das Schreiben scheitert. */
  async createNamedCampaign(input: string): Promise<boolean> {
    const raw = input.trim();
    if (!raw) return false;

    const slug = slugKeepUmlauts(raw);
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const campaignMd = `${VAULT_BASE}/${slug}/campaign.md`;

    const template = `# ${name}\n\n` + DOCUMENT_TEMPLATES.campaign;
    try {
      await invoke('write_file_content', { path: campaignMd, content: template });
    } catch (err) {
      console.error('Kampagne konnte nicht erstellt werden:', err);
      return false;
    }
    await this.openCreated(slug);
    return true;
  }

  /** @returns false, wenn das Kopieren scheitert. */
  async createFromTemplate(template: CampaignTemplateRef, options: CampaignTemplateOptions): Promise<boolean> {
    try {
      const slug = await instantiateCampaignTemplate(template, options);
      // Die Vorlage legt auch Charaktere an — deren Liste und der Katalog hängen am Vault-Signal.
      invalidateVault();
      await this.openCreated(slug);
      return true;
    } catch (err) {
      console.error('Kampagne konnte nicht aus der Vorlage erstellt werden:', err);
      return false;
    }
  }

  private async openCreated(slug: string): Promise<void> {
    this.showChooser = false;
    await this.loadCampaigns();
    const newCampaign = this.campaigns.find((c) => c.path === slug);
    if (newCampaign) {
      activeCampaign.set(newCampaign);
      await navigateTo({ name: 'campaign', path: `${VAULT_BASE}/${slug}/campaign.md`, type: 'campaign' });
    }
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
    const path = encounterPathOf(campaignPath, actDirName, filename);
    await navigateTo({ name: filename.replace('.json', ''), path, type: 'encounter' });
  }

  async createActEncounter(campaignPath: string, actDirName: string, e: KeyboardEvent | MouseEvent): Promise<void> {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const key = actKeyOf(campaignPath, actDirName);
    const raw = this.newActEncounterInput[key]?.trim();
    if (!raw) return;

    const slug = slugKeepUmlauts(raw);
    const filename = slug + '.json';
    const path = encounterPathOf(campaignPath, actDirName, filename);
    try {
      await invoke('write_file_content', { path, content: newEncounterJson(raw.charAt(0).toUpperCase() + raw.slice(1)) });
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
        const actDirs = await listActDirs(actsDirPath(campaignPath));
        this.sectionFiles[key] = actDirs;
        for (const dirName of actDirs) {
          const indexPath = actIndexPath(campaignPath, dirName);
          try {
            const content = await invoke<string>('read_file_content', { path: indexPath });
            this.fileTitles[indexPath] = extractActTitle(content, dirName);
          } catch {
            this.fileTitles[indexPath] = dirName;
          }
          await this.loadEncountersForAct(campaignPath, dirName);
        }
      } catch {
        this.sectionFiles[key] = [];
      }
    } else if (JSON_SECTION_TYPES.has(section.type)) {
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

  /** Der KI-Kontext liest dieselbe Reihenfolge — ohne das Nachladen weicht der Prompt ab. */
  async moveAct(campaignPath: string, section: CampaignSection, index: number, delta: number): Promise<void> {
    const key = sectionKeyOf(campaignPath, section);
    const dirs = this.sectionFiles[key];
    if (!dirs) return;
    try {
      this.sectionFiles[key] = await moveAct(actsDirPath(campaignPath), dirs, index, delta);
      loadActSummaries(campaignPath);
    } catch (err) {
      console.error('Akt-Reihenfolge konnte nicht gespeichert werden:', err);
    }
  }

  async toggleSection(campaignPath: string, section: CampaignSection): Promise<void> {
    const key = sectionKeyOf(campaignPath, section);
    this.expanded[key] = !this.expanded[key];
    if (this.expanded[key]) await this.loadSection(campaignPath, section);
  }

  /** Für Dateien, die nicht über den Baum entstanden sind. */
  async refreshSectionOf(path: string): Promise<void> {
    const m = path.slice(VAULT_BASE.length + 1).match(/^([^/]+)\/([^/]+)\//);
    const section = m && SECTIONS.find((s) => s.subdir === m[2]);
    if (m && section) await this.loadSection(m[1], section);
  }

  async openFile(campaignPath: string, section: CampaignSection, filenameOrDir: string): Promise<void> {
    const fullPath = sectionEntryPath(campaignPath, section, filenameOrDir);
    const displayName = filenameOrDir.replace(/\.(md|json)$/, '');
    await navigateTo({ name: displayName, path: fullPath, type: section.type });
  }

  async selectCampaign(campaign: Campaign): Promise<void> {
    // Guard hier statt in `openCampaignFile`: sonst zeigt `activeCampaign` schon
    // woandershin, wenn der Nutzer abbricht.
    if (!(await confirmNavigation())) return;
    activeCampaign.set({ ...campaign });
    await this.openCampaignFile(campaign.path);
  }

  async openCampaignFile(campaignPath: string): Promise<void> {
    const fullPath = `${VAULT_BASE}/${campaignPath}/campaign.md`;
    await navigateTo({ name: 'campaign', path: fullPath, type: 'campaign' }, { guard: false });
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

    const isJson = JSON_SECTION_TYPES.has(section.type);
    const isAct = section.type === 'act';
    // Ein Akt heißt wie sein Verzeichnis, die index.md steckt darin — so listet
    // `loadSection` ihn auch, und `openFile` erwartet genau diesen Namen.
    const entryName = isAct ? slug : `${slug}${isJson ? '.json' : '.md'}`;
    const fullPath = isAct
      ? actIndexPath(campaignPath, slug)
      : `${VAULT_BASE}/${campaignPath}/${section.subdir}/${entryName}`;

    try {
      const sectionTemplate =
        section.type === 'npc' ? JSON.stringify(npcSchema.parse({ name: title }), null, 2)
        : section.type === 'encounter' ? newEncounterJson(title)
        : section.type === 'map' || section.type === 'mapTemplate' ? serializeBattleMap(newBattleMap(title))
        : section.type === 'handout' ? JSON.stringify(handoutSchema.parse({ name: title }), null, 2)
        : `# ${title}\n\n` + (DOCUMENT_TEMPLATES[section.type] ?? '');
      await invoke('write_file_content', { path: fullPath, content: sectionTemplate });
      this.showNewFileInput[key] = false;
      this.newFileInput[key] = '';
      await this.loadSection(campaignPath, section);
      await this.openFile(campaignPath, section, entryName);
      if (section.type === 'act') loadActSummaries(campaignPath);
      if (section.type === 'encounter') loadEncounterContext(campaignPath);
    } catch (err) {
      console.error('Datei konnte nicht erstellt werden:', err);
    }
  }

  cancelNewFile(key: string, e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.showNewFileInput[key] = false; this.newFileInput[key] = ''; }
  }
}

/** Geteilt, damit die Startseite Kampagnen in denselben Baum anlegt. */
export const campaignTree = new CampaignTreeState();
