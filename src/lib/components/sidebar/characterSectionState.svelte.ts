/**
 * Ladezustand und Anlage-/Import-Flows der „Charaktere"-Sektion der Seitenleiste.
 */
import { invoke } from '@tauri-apps/api/core';
import { activeFile, setFileContent } from '../../stores/campaign';
import { confirmNavigation } from '../../stores/navigationGuard';
import { deleteEntry } from '../../services/sidebar/deleteEntry';
import { createBlankCharacter, createWizardCharacter } from '../../services/characterCreate';
import {
  CHARACTERS_PATH,
  characterLabel,
  listCharacterRefs,
  readCharacterName,
} from '../../services/characterDirectory';
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

  async load(): Promise<void> {
    let loose: EntryInfo[] = [];
    try {
      const entries = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
      loose = entries.filter((e) => !e.is_dir);
    } catch {
      loose = [];
    }
    // Ordnernamen sind UIDs und damit ohne Aussage — die Reihenfolge kommt aus den
    // Anzeigenamen, die `listCharacterRefs` schon sortiert liefert.
    const meta: Record<string, { name: string; classes: CharClass[] }> = {};
    const refs = await listCharacterRefs();
    for (const ref of refs) {
      meta[ref.uid] = { name: characterLabel(ref), classes: parseClasses(ref.classLevel) };
    }
    this.meta = meta;
    this.entries = [...refs.map((r) => ({ name: r.uid, is_dir: true })), ...loose];
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
      // `name` ist reine Anzeige (Kontextleiste, KI-Prompt); Identität ist `dirPath`.
      const label = this.meta[entry.name]?.name ?? (await readCharacterName(entry.name)) ?? '';
      activeFile.set({
        name: characterLabel({ uid: entry.name, name: label }),
        path: `${dirPath}/character.json`,
        type: 'character',
        dirPath,
      });
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
    const uid = await createBlankCharacter(this.newInput);
    if (!uid) return;
    this.showNewInput = false;
    this.newInput = '';
    await this.load();
    await this.openCharacter({ name: uid, is_dir: true });
  }

  cancelNewCharacter(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.showNewInput = false; this.newInput = ''; }
  }

  async createFromWizard(character: Character): Promise<void> {
    const uid = await createWizardCharacter(character);
    if (!uid) return;
    this.showWizard = false;
    this.expanded = true;
    await this.load();
    await this.openCharacter({ name: uid, is_dir: true });
  }

  deleteCharacter(entry: EntryInfo): void {
    const label = this.meta[entry.name]?.name ?? entry.name.replace('.md', '');
    deleteEntry(`${CHARACTERS_PATH}/${entry.name}`, label, entry.is_dir, () => this.load());
  }
}

export function createCharacterSectionState(): CharacterSectionState {
  return new CharacterSectionState();
}
