/**
 * Node-Ersatz für `@tauri-apps/api/core`: bedient die lesenden Vault-Commands per `node:fs`
 * gegen den Repo-Vault, damit Fixtures über den ECHTEN Ladepfad geladen werden können.
 * Eingehängt per Vitest-Alias (vitest.config.ts).
 *
 * Bewusst KEIN `window.__TAURI_INTERNALS__` (wie `mockIPC` es setzen würde) — sonst wäre
 * `isTauri()` true und `httpFetch` schickte die LLM-Calls über den Tauri-HTTP-Pfad statt
 * über das globale `fetch`. Nur `invoke` wird ausgetauscht.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** App-Pfade sind repo-relativ ('./vault/...'); CWD im Eval = Projekt-Root. */
function vaultPath(p: string): string {
  return resolve(process.cwd(), p);
}

/** Leichtes Pendant zu Rusts `SpellInfo` (nur die Index-Felder). */
interface SpellIndexEntry {
  name: string;
  name_en: string;
  key: string;
  level: number;
  classes: string[];
  school: string;
  path: string;
}

/** Rekursives Pendant zu Rusts `collect_spells`: liest alle Zauber-JSONs unter `dir`. */
function collectSpells(dir: string, out: SpellIndexEntry[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      collectSpells(full, out);
    } else if (e.name.endsWith('.json')) {
      try {
        const v = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
        const name = typeof v.name === 'string' ? v.name : '';
        if (!name) continue;
        out.push({
          name,
          name_en: typeof v.name_en === 'string' ? v.name_en : '',
          key: typeof v.key === 'string' ? v.key : '',
          level: typeof v.level === 'number' ? v.level : Number.parseInt(String(v.level), 10) || 0,
          classes: Array.isArray(v.classes) ? v.classes.filter((c): c is string => typeof c === 'string') : [],
          school: typeof v.school === 'string' ? v.school : '',
          path: './' + relative(process.cwd(), full).replace(/\\/g, '/'),
        });
      } catch {
        /* defekte Datei überspringen */
      }
    }
  }
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const a = args ?? {};
  switch (cmd) {
    case 'list_json_files':
      return readdirSync(vaultPath(String(a.path)))
        .filter((f) => f.endsWith('.json')) as unknown as T;
    case 'list_json_entries':
      return readdirSync(vaultPath(String(a.path)), { withFileTypes: true })
        .filter((e) => e.isDirectory() || e.name.endsWith('.json'))
        .map((e) => ({ name: e.name, is_dir: e.isDirectory() })) as unknown as T;
    case 'read_file_content':
      return readFileSync(vaultPath(String(a.path)), 'utf8') as unknown as T;
    case 'load_spells_index': {
      // Für das Zauber-Grounding im featureEffects-Dreipass (getSpellLibrary → resolveSpell).
      const spells: SpellIndexEntry[] = [];
      collectSpells(vaultPath(String(a.path)), spells);
      spells.sort((x, y) => x.name.localeCompare(y.name));
      return spells as unknown as T;
    }
    default:
      throw new Error(
        `[eval] Tauri-Command "${cmd}" ist im Eval-Shim nicht implementiert ` +
          `(tests/support/tauriInvokeShim.ts). Nur lesende Vault-Commands werden unterstützt.`,
      );
  }
}
