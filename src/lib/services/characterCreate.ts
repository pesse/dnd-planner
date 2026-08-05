/**
 * Anlage von Charakteren: leerer Bogen, Wizard-Ergebnis, PDF-Import. Liefert je
 * Weg den Verzeichnis-Slug zurück; das Öffnen bleibt Sache des Aufrufers.
 */
import { invoke } from '@tauri-apps/api/core';
import { CHARACTER_VERSION } from '../schemas/characterUpgrades';
import type { Character } from '../schemas/characterSchema';
import { emptyPersonal, emptyProficiencies, type CharacterJSON } from '../pdf/characterFields';
import { emptySpellcasting } from './spellcasting/write';
import { characterFromPdfFields } from '../pdf/characterImport';
import { choosePdfFile, readPdfFields } from '../pdf/characterPdfIo';
import { slugKeepUmlauts } from '../utils/text';

export const CHARACTERS_PATH = './vault/characters';

export type PdfImportResult =
  | { status: 'ok'; slug: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function blankCharacterJson(name: string): CharacterJSON {
  return {
    // Neu in der App entstanden → schon im aktuellen Format, kein Upgrade nötig.
    _version: CHARACTER_VERSION,
    name,
    classes: [],
    classLevel: '', playerName: '',
    backgroundRef: { sourceKey: '', name: '' }, background: '',
    species: { sourceKey: '', name: '' }, race: '', xp: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    mods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    ac: '', initiative: '', speed: '', hpMax: '', hpCurrent: '', hpTemp: '',
    proficiencyBonus: 2, passivePerception: '', hitDice: '',
    saveProfs: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skills: {},
    attacks: [],
    classFeatures: '', traits: '', ideals: '', bonds: '', flaws: '',
    languages: [], tools: [], alleskoenner: false,
    currency: { km: '', sm: '', em: '', gm: '', pm: '' },
    inventory: [], inventoryNotes: '', totalWeight: '',
    spellcasting: emptySpellcasting(),
    personal: emptyPersonal(),
    proficiencies: emptyProficiencies(),
    masteries: [],
    features: [],
  };
}

const gmNotesTemplate = (name: string): string =>
  `# GM-Notizen: ${name}\n\n## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`;

async function writeCharacter(slug: string, notesName: string, json: CharacterJSON): Promise<void> {
  const dirPath = `${CHARACTERS_PATH}/${slug}`;
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify(json, null, 2) });
  await invoke('write_file_content', { path: `${dirPath}/gm-notes.md`, content: gmNotesTemplate(notesName) });
}

/** Leerer Charakter aus einem eingetippten Namen; null = leere Eingabe oder Schreibfehler. */
export async function createBlankCharacter(rawName: string): Promise<string | null> {
  const raw = rawName.trim();
  if (!raw) return null;
  const slug = slugKeepUmlauts(raw, '_');
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  try {
    await writeCharacter(slug, name, blankCharacterJson(name));
    return slug;
  } catch (err) {
    console.error('Charakter konnte nicht erstellt werden:', err);
    return null;
  }
}

/** Übernimmt den vom Wizard fertig zusammengesetzten Charakter. */
export async function createWizardCharacter(character: Character): Promise<string | null> {
  const raw = (character.name || 'Neuer Charakter').trim();
  const slug = slugKeepUmlauts(raw, '_') || 'charakter';
  try {
    await writeCharacter(slug, raw, character);
    return slug;
  } catch (err) {
    console.error('Charakter konnte nicht erstellt werden:', err);
    return null;
  }
}

/**
 * Dateiauswahl + Import eines Taendler-Bogens als neuer Charakter. `onPicked` meldet
 * den Beginn des eigentlichen Imports — die Dateiauswahl davor zählt nicht als Arbeit.
 */
export async function importCharacterFromPdf(onPicked?: () => void): Promise<PdfImportResult> {
  let path: string;
  try {
    const selected = await choosePdfFile(CHARACTERS_PATH);
    if (!selected) return { status: 'cancelled' };
    path = selected;
  } catch (e) {
    return { status: 'error', message: `Dateiauswahl fehlgeschlagen: ${e}` };
  }

  onPicked?.();
  try {
    const data = characterFromPdfFields(await readPdfFields(path));

    const charName = data.name || path.split(/[/\\]/).pop()?.replace(/\.pdf$/i, '') || 'unbekannt';
    const slug = slugKeepUmlauts(charName, '_');
    const json: CharacterJSON = {
      // BEWUSST v1: das PDF liefert Klasse/Volk/Hintergrund als Freitext. Die
      // Upgrade-Pipeline (schemas/character.ts) strukturiert das beim ersten Laden.
      _version: 1,
      _importedFrom: path.split(/[/\\]/).pop() ?? path,
      _importedAt: new Date().toISOString(),
      ...data,
    };
    await invoke('write_file_content', {
      path: `${CHARACTERS_PATH}/${slug}/character.json`,
      content: JSON.stringify(json, null, 2),
    });
    return { status: 'ok', slug };
  } catch (e) {
    return { status: 'error', message: `Import fehlgeschlagen: ${e}` };
  }
}
