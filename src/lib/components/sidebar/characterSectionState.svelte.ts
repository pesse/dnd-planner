/**
 * Ladezustand und Anlage-/Import-Flows der „Charaktere"-Sektion der Seitenleiste.
 */
import { invoke } from '@tauri-apps/api/core';
import { navigateTo } from '../../services/navigation';
import { invalidateVault } from '../../stores/campaign';
import { createWizardCharacter } from '../../services/characterCreate';
import {
  CHARACTERS_PATH,
  characterLabel,
  listCharacterRefs,
  readCharacterName,
} from '../../services/characterDirectory';
import type { Character } from '../../schemas/characterSchema';
import { instantiateCharacterTemplate } from '../../services/templates/templates';

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
  showChooser = $state(false);
  showWizard = $state(false);
  /** Der nächste Wizard würfelt sofort alles. */
  wizardRandom = $state(false);
  showImport = $state(false);

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
    if (!entry.is_dir) {
      const fullPath = `${CHARACTERS_PATH}/${entry.name}`;
      await navigateTo({ name: entry.name.replace('.md', ''), path: fullPath, type: 'character' });
      return;
    }
    const dirPath = `${CHARACTERS_PATH}/${entry.name}`;
    // `name` ist reine Anzeige (Kontextleiste, KI-Prompt); Identität ist `dirPath`.
    const label = this.meta[entry.name]?.name ?? (await readCharacterName(entry.name)) ?? '';
    await navigateTo({
      name: characterLabel({ uid: entry.name, name: label }),
      path: `${dirPath}/character.json`,
      type: 'character',
      dirPath,
    });
  }


  async createFromWizard(character: Character, details = ''): Promise<void> {
    const uid = await createWizardCharacter(character, details);
    if (!uid) return;
    this.showWizard = false;
    this.showImport = false;
    await this.openCreated(uid);
  }

  async createFromTemplate(templateDir: string, level: number): Promise<void> {
    const uid = await instantiateCharacterTemplate(templateDir, level);
    this.showChooser = false;
    await this.openCreated(uid);
  }

  private async openCreated(uid: string): Promise<void> {
    invalidateVault();
    this.expanded = true;
    await this.load();
    await this.openCharacter({ name: uid, is_dir: true });
  }
}

/** Geteilt, damit die Startseite dieselbe Auswahl öffnet wie das „+" der Seitenleiste. */
export const characterSection = new CharacterSectionState();
