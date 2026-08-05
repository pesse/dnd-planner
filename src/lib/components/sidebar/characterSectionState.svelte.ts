/**
 * Ladezustand und Anlage-/Import-Flows der „Charaktere"-Sektion der Seitenleiste.
 */
import { invoke } from '@tauri-apps/api/core';
import { activeFile, setFileContent } from '../../stores/campaign';
import { confirmNavigation } from '../../stores/navigationGuard';
import { deleteEntry } from '../../services/sidebar/deleteEntry';
import { ensureCharacterJson } from '../../pdf/characterImport';
import {
  CHARACTERS_PATH,
  createBlankCharacter,
  createWizardCharacter,
  importCharacterFromPdf,
} from '../../services/characterCreate';
import type { Character } from '../../schemas/characterSchema';

export { CHARACTERS_PATH };

interface EntryInfo { name: string; is_dir: boolean; }
type CharClass = { icon: string; label: string; level: number | null };

// Erkennung per Substring in `classLevel`; ASCII-Schreibweisen zeigen aufs selbe Label.
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

// "Magier 5 / Zauberer 3" → zwei Einträge mit je Icon und Level.
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

export class CharacterSectionState {
  expanded = $state(false);
  entries: EntryInfo[] = $state([]);
  meta: Record<string, { name: string; classes: CharClass[] }> = $state({});
  showNewInput = $state(false);
  newInput = $state('');
  showWizard = $state(false);
  pdfImporting = $state(false);
  pdfImportError = $state('');

  async load(): Promise<void> {
    try {
      this.entries = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
    } catch {
      this.entries = [];
    }
    const meta: Record<string, { name: string; classes: CharClass[] }> = {};
    await Promise.all(
      this.entries
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
          }
        })
    );
    this.meta = meta;
  }

  async reload(): Promise<void> {
    if (this.expanded) await this.load();
  }

  async toggle(): Promise<void> {
    this.expanded = !this.expanded;
    if (this.expanded) await this.load();
  }

  async openCharacter(entry: EntryInfo): Promise<void> {
    if (!(await confirmNavigation())) return;
    if (entry.is_dir) {
      const dirPath = `${CHARACTERS_PATH}/${entry.name}`;
      // PDF ist reine Import-Quelle — fehlt die character.json, einmalig daraus anlegen.
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

  async createCharacter(e: KeyboardEvent | MouseEvent): Promise<void> {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    const slug = await createBlankCharacter(this.newInput);
    if (!slug) return;
    this.showNewInput = false;
    this.newInput = '';
    await this.load();
    await this.openCharacter({ name: slug, is_dir: true });
  }

  cancelNewCharacter(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.showNewInput = false; this.newInput = ''; }
  }

  async createFromWizard(character: Character): Promise<void> {
    const slug = await createWizardCharacter(character);
    if (!slug) return;
    this.showWizard = false;
    this.expanded = true;
    await this.load();
    await this.openCharacter({ name: slug, is_dir: true });
  }

  async importFromPdf(): Promise<void> {
    this.pdfImportError = '';
    const result = await importCharacterFromPdf(() => (this.pdfImporting = true));
    this.pdfImporting = false;
    if (result.status === 'error') this.pdfImportError = result.message;
    if (result.status !== 'ok') return;
    this.expanded = true;
    await this.load();
    await this.openCharacter({ name: result.slug, is_dir: true });
  }

  deleteCharacter(entry: EntryInfo): void {
    deleteEntry(`${CHARACTERS_PATH}/${entry.name}`, entry.name.replace('.md', ''), entry.is_dir, () => this.load());
  }
}

export function createCharacterSectionState(): CharacterSectionState {
  return new CharacterSectionState();
}
