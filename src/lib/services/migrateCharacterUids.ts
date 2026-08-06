/**
 * Einmalige Umstellung des Altbestands: Charakterordner hießen früher nach dem
 * Namens-Slug des Charakters. Weil der Ordnername die Identität ist, überschrieben sich
 * gleichnamige Charaktere und ein umbenannter Charakter behielt den alten Slug. Ab jetzt
 * ist der Ordnername eine UID — hier bekommen Altordner ihre, und alle Verweise darauf
 * (Frontmatter und Markdown-Links in den Kampagnen) ziehen mit.
 */
import { invoke } from '@tauri-apps/api/core';
import { CHARACTERS_PATH } from './characterDirectory';
import { parseFrontmatter } from '../utils/frontmatter';
import { isUid, newUid } from '../utils/uid';

const CAMPAIGNS_PATH = './vault/campaigns';

interface EntryInfo {
  name: string;
  is_dir: boolean;
}

export interface UidMigrationReport {
  renamed: number;
  filesUpdated: number;
  failed: string[];
}

/**
 * Nur die Charakter-Einträge im Frontmatter-Block ersetzen. Bewusst NICHT über
 * `replaceFrontmatterCharacters` — das baut den Block kanonisch neu auf und würde
 * unbekannte Schlüssel und die vorhandene Formatierung verlieren.
 */
export function remapCharacterRefs(markdown: string, map: Map<string, string>): string {
  const { rawBlock } = parseFrontmatter(markdown);
  let out = markdown;

  if (rawBlock) {
    let inCharacters = false;
    const remapped = rawBlock
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed === 'characters:') {
          inCharacters = true;
          return line;
        }
        // Inline-Form: `characters: [a, b]`
        const inline = line.match(/^(characters:\s*\[)([^\]]*)(\].*)$/);
        if (inline) {
          inCharacters = false;
          const items = inline[2]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => map.get(s) ?? s);
          return `${inline[1]}${items.join(', ')}${inline[3]}`;
        }
        if (!inCharacters) return line;
        if (trimmed === '') return line;
        // Listenform: `  - slug`
        const item = line.match(/^(\s*-\s*)(.*)$/);
        if (!item) {
          inCharacters = false;
          return line;
        }
        const mapped = map.get(item[2].trim());
        return mapped ? `${item[1]}${mapped}` : line;
      })
      .join('\n');
    out = remapped + markdown.slice(rawBlock.length);
  }

  // Markdown-Links auf den Charakterordner — auch die relativen, die `resolveVaultPath`
  // erst zum Vault-Pfad zusammensetzt. Das Ende des Segments muss mitgeprüft werden,
  // sonst träfe „silvara" auch einen Ordner „silvara-alt".
  for (const [oldDir, uid] of map) {
    const esc = oldDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(characters/)${esc}(?=[/)\\]"'\\s]|$)`, 'g'), `$1${uid}`);
  }
  return out;
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  let entries: EntryInfo[];
  try {
    entries = await invoke<EntryInfo[]>('list_entries', { path: dir });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    const path = `${dir}/${e.name}`;
    if (e.is_dir) files.push(...(await listMarkdownFiles(path)));
    else if (e.name.toLowerCase().endsWith('.md')) files.push(path);
  }
  return files;
}

/** Ordner, deren Name noch kein UID ist. */
export async function legacyCharacterDirs(): Promise<string[]> {
  try {
    const entries = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
    return entries.filter((e) => e.is_dir && !isUid(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}

async function assignUid(dir: string, taken: Set<string>): Promise<string> {
  const jsonPath = `${CHARACTERS_PATH}/${dir}/character.json`;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(await invoke<string>('read_file_content', { path: jsonPath }));
  } catch {
    // Ordner ohne (lesbare) character.json bekommt trotzdem eine UID — der Ordner
    // samt Nebendateien soll nicht mit dem alten Namen zurückbleiben.
  }

  const existing = typeof data.uid === 'string' && isUid(data.uid) ? data.uid : '';
  let uid = existing && !taken.has(existing) ? existing : newUid();
  while (taken.has(uid)) uid = newUid();
  taken.add(uid);

  if (Object.keys(data).length) {
    await invoke('write_file_content', {
      path: jsonPath,
      content: JSON.stringify({ ...data, uid }, null, 2),
    });
  }
  return uid;
}

/** Führt die Umstellung aus. Gibt es nichts zu tun, ist `renamed` 0. */
export async function migrateCharacterUids(): Promise<UidMigrationReport> {
  const legacy = await legacyCharacterDirs();
  const report: UidMigrationReport = { renamed: 0, filesUpdated: 0, failed: [] };
  if (legacy.length === 0) return report;

  const all = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
  const taken = new Set(all.filter((e) => e.is_dir && isUid(e.name)).map((e) => e.name));

  const map = new Map<string, string>();
  for (const dir of legacy) {
    try {
      const uid = await assignUid(dir, taken);
      await invoke('rename_file', {
        oldPath: `${CHARACTERS_PATH}/${dir}`,
        newPath: `${CHARACTERS_PATH}/${uid}`,
      });
      map.set(dir, uid);
    } catch (e) {
      report.failed.push(`${dir}: ${e instanceof Error ? e.message : e}`);
    }
  }
  report.renamed = map.size;
  if (map.size === 0) return report;

  // Verweise erst nach den Umbenennungen anfassen, und nur für die geglückten.
  for (const file of await listMarkdownFiles(CAMPAIGNS_PATH)) {
    try {
      const content = await invoke<string>('read_file_content', { path: file });
      const updated = remapCharacterRefs(content, map);
      if (updated !== content) {
        await invoke('write_file_content', { path: file, content: updated });
        report.filesUpdated++;
      }
    } catch (e) {
      report.failed.push(`${file}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return report;
}
