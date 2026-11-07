/**
 * Die Datei-Commands aus `src-tauri/src/lib.rs` in Node, gegen den Vault des Repos.
 * Genutzt vom Test-Shim (nur die lesenden) und von der Vault-Brücke des Browser-Dev-Servers.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, type Dirent } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const root = (): string => process.cwd();

export function resolveVaultPath(p: string): string {
  return isAbsolute(p) ? p : resolve(root(), p.replace(/^(\.\/)+/, ''));
}

const isHidden = (name: string) => name.startsWith('.');
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function entries(path: string, keep: (e: Dirent) => boolean): { name: string; is_dir: boolean }[] {
  return readdirSync(resolveVaultPath(path), { withFileTypes: true })
    .filter((e) => !isHidden(e.name) && (e.isDirectory() || keep(e)))
    .map((e) => ({ name: e.name, is_dir: e.isDirectory() }))
    .sort((a, b) => byName(a.name, b.name));
}

function filesEnding(path: string, ext: string): string[] {
  const dir = resolveVaultPath(path);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => e.name)
    .sort(byName);
}

function walkFiles(dir: string, out: string[]): void {
  let list: Dirent[];
  try {
    list = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of list.filter((x) => !isHidden(x.name)).sort((a, b) => byName(a.name, b.name))) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, out);
    else if (e.isFile()) out.push(full);
  }
}

const relSlash = (from: string, to: string) => relative(from, to).replace(/\\/g, '/');

/** Leichtes Pendant zu Rusts `SpellInfo` (nur die Index-Felder). */
interface SpellIndexEntry {
  name: string;
  name_en: string;
  key: string;
  source: string;
  level: number;
  classes: string[];
  school: string;
  ritual: boolean;
  concentration: boolean;
  casting_time: string;
  range: string;
  components: string;
  materials: string;
  path: string;
  attack?: unknown;
  attackEffects?: unknown;
}

function componentsOf(raw: unknown): { components: string; materials: string } {
  const c = (raw ?? {}) as Record<string, unknown>;
  const letters = (['verbal', 'somatic', 'material'] as const).filter((k) => c[k] === true).map((k) => k[0].toUpperCase());
  return { components: letters.join(''), materials: typeof c.materials_needed === 'string' ? c.materials_needed : '' };
}

function spellOf(full: string): SpellIndexEntry | null {
  const v = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name : '';
  if (!name) return null;
  return {
    name,
    name_en: typeof v.name_en === 'string' ? v.name_en : '',
    key: typeof v.key === 'string' ? v.key : '',
    source: typeof v.source === 'string' ? v.source : String((v.document as { key?: unknown })?.key ?? ''),
    level: typeof v.level === 'number' ? v.level : Number.parseInt(String(v.level), 10) || 0,
    classes: Array.isArray(v.classes) ? v.classes.filter((c): c is string => typeof c === 'string') : [],
    school: typeof v.school === 'string' ? v.school : '',
    ritual: v.ritual === true,
    concentration: v.concentration === true,
    casting_time: typeof v.casting_time === 'string' ? v.casting_time : '',
    range: typeof v.range === 'string' ? v.range : '',
    ...componentsOf(v.components),
    path: './' + relSlash(root(), full),
    ...(v.attack != null ? { attack: v.attack } : {}),
    ...(v.attackEffects != null ? { attackEffects: v.attackEffects } : {}),
  };
}

function loadSpellsIndex(path: string): SpellIndexEntry[] {
  const files: string[] = [];
  walkFiles(resolveVaultPath(path), files);
  const spells: SpellIndexEntry[] = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    try {
      const s = spellOf(f);
      if (s) spells.push(s);
    } catch {
      /* defekte Datei überspringen */
    }
  }
  return spells.sort((x, y) => x.name.localeCompare(y.name));
}

function readJsonFolder(path: string): { name: string; content: string | null }[] {
  const dir = resolveVaultPath(path);
  let names: string[];
  try {
    names = readdirSync(dir).filter((f) => !isHidden(f) && f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  return names.map((name) => {
    try {
      return { name, content: readFileSync(join(dir, name), 'utf8') };
    } catch {
      return { name, content: null };
    }
  });
}

function writeFile(path: string, data: string | Buffer): null {
  const p = resolveVaultPath(path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  return null;
}

function dirFingerprint(paths: string[]): string {
  const hash = createHash('sha256');
  for (const p of paths) {
    hash.update('#\n');
    const dir = resolveVaultPath(p);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const files: string[] = [];
    walkFiles(dir, files);
    for (const f of files) {
      hash.update(relSlash(dir, f)).update('\0').update(createHash('sha256').update(readFileSync(f)).digest()).update('\n');
    }
  }
  return hash.digest('hex');
}

type Args = Record<string, unknown>;
const s = (a: Args, k: string) => String(a[k]);

export const READ_COMMANDS = {
  read_file_content: (a: Args) => readFileSync(resolveVaultPath(s(a, 'path')), 'utf8'),
  read_file_base64: (a: Args) => readFileSync(resolveVaultPath(s(a, 'path'))).toString('base64'),
  list_directory: (a: Args) => filesEnding(s(a, 'path'), '.md'),
  list_json_files: (a: Args) => filesEnding(s(a, 'path'), '.json'),
  list_entries: (a: Args) => entries(s(a, 'path'), (e) => e.isFile() && e.name.endsWith('.md')),
  list_json_entries: (a: Args) => entries(s(a, 'path'), (e) => e.isFile() && e.name.endsWith('.json')),
  read_json_folder: (a: Args) => readJsonFolder(s(a, 'path')),
  load_spells_index: (a: Args) => loadSpellsIndex(s(a, 'path')),
  get_absolute_path: (a: Args) => resolveVaultPath(s(a, 'path')),
  dir_fingerprint: (a: Args) => dirFingerprint((a.paths as string[]) ?? []),
  list_art: () => {
    const dir = resolveVaultPath('./vault/art');
    const files: string[] = [];
    walkFiles(dir, files);
    return files.filter((f) => f.endsWith('.avif')).map((f) => relSlash(dir, f).slice(0, -'.avif'.length));
  },
} satisfies Record<string, (a: Args) => unknown>;

export const WRITE_COMMANDS = {
  write_file_content: (a: Args) => writeFile(s(a, 'path'), s(a, 'content')),
  write_file_base64: (a: Args) => writeFile(s(a, 'path'), Buffer.from(s(a, 'data'), 'base64')),
  delete_path: (a: Args) => {
    const p = resolveVaultPath(s(a, 'path'));
    if (!existsSync(p)) throw new Error(`Pfad existiert nicht: ${p}`);
    rmSync(p, { recursive: true });
    return null;
  },
  rename_file: (a: Args) => {
    const to = resolveVaultPath(s(a, 'newPath'));
    mkdirSync(dirname(to), { recursive: true });
    renameSync(resolveVaultPath(s(a, 'oldPath')), to);
    return null;
  },
  copy_dir: (a: Args) => {
    const [from, to] = [resolveVaultPath(s(a, 'from')), resolveVaultPath(s(a, 'to'))];
    if (!existsSync(from) || !statSync(from).isDirectory()) throw new Error(`${s(a, 'from')} ist kein Ordner`);
    if (existsSync(to)) throw new Error(`${s(a, 'to')} existiert bereits`);
    cpSync(from, to, { recursive: true });
    return null;
  },
} satisfies Record<string, (a: Args) => unknown>;
