/**
 * Alles im Charakterverzeichnis AUSSER `character.json`: GM-Notizen, Details und das
 * Portrait. Die beiden Markdown-Dateien speichern sich selbst (`AutosaveFile`).
 */
import { invoke } from '@tauri-apps/api/core';
import { AutosaveFile, type SaveStatus } from '../utils/autosaveFile.svelte';

const GM_NOTES_TEMPLATE_PATH = './vault/templates/character.md';
const GM_NOTES_FALLBACK = `## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`;

export interface CharacterSideFiles {
  readonly gmNotes: string;
  readonly details: string;
  readonly gmNotesStatus: SaveStatus;
  readonly detailsStatus: SaveStatus;
  /** Data-URL des Portraits; leer, wenn keines hinterlegt oder ladbar ist. */
  readonly portraitUrl: string;
  onGmNotesChange(md: string): void;
  onDetailsChange(md: string): void;
}

export function createCharacterSideFiles(deps: {
  dirPath: () => string;
  /** Nur für die Überschrift frisch angelegter GM-Notizen. */
  characterName: () => string;
  portraitFile: () => string | undefined;
}): CharacterSideFiles {
  let gmNotes = $state('');
  let details = $state('');
  let portraitUrl = $state('');
  const gmNotesSave = new AutosaveFile();
  const detailsSave = new AutosaveFile();

  $effect(() => {
    const dir = deps.dirPath();
    if (!dir) return;
    detailsSave.cancel();
    gmNotesSave.cancel();
    void load(dir);
  });

  $effect(() => {
    const dir = deps.dirPath();
    const file = deps.portraitFile();
    if (!file) { portraitUrl = ''; return; }
    invoke<string>('read_file_base64', { path: `${dir}/${file}` })
      .then((b64) => {
        const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        portraitUrl = `data:${mime};base64,${b64}`;
      })
      .catch(() => { portraitUrl = ''; });
  });

  async function load(dir: string) {
    gmNotes = await readOrCreateGmNotes(`${dir}/gm-notes.md`, deps.characterName());
    // Alte `freitext.md` weiterlesen, solange noch keine `details.md` existiert.
    details = await readFile(`${dir}/details.md`) ?? await readFile(`${dir}/freitext.md`) ?? '';
    detailsSave.markSaved();
    gmNotesSave.markSaved();
  }

  return {
    get gmNotes() { return gmNotes; },
    get details() { return details; },
    get gmNotesStatus() { return gmNotesSave.status; },
    get detailsStatus() { return detailsSave.status; },
    get portraitUrl() { return portraitUrl; },

    onGmNotesChange(md) {
      gmNotes = md;
      gmNotesSave.schedule(`${deps.dirPath()}/gm-notes.md`, md);
    },
    onDetailsChange(md) {
      details = md;
      detailsSave.schedule(`${deps.dirPath()}/details.md`, md);
    },
  };
}

async function readFile(path: string): Promise<string | null> {
  try {
    return await invoke<string>('read_file_content', { path });
  } catch {
    return null;
  }
}

async function readOrCreateGmNotes(path: string, characterName: string): Promise<string> {
  const existing = await readFile(path);
  if (existing != null) return existing;
  const tmpl = await readFile(GM_NOTES_TEMPLATE_PATH);
  const content = `# GM-Notizen: ${characterName}\n\n` + (tmpl || GM_NOTES_FALLBACK);
  await invoke('write_file_content', { path, content });
  return content;
}
