/**
 * Erzählreihenfolge der Akte einer Kampagne, abgelegt als `acts/order.json`.
 * `list_entries` liefert nur Verzeichnisse und `.md` — die Datei bleibt der Seitenleiste
 * damit unsichtbar und braucht keinen eigenen Rust-Command.
 */
import { invoke } from '@tauri-apps/api/core';

const ORDER_FILE = 'order.json';

/**
 * Selbstheilend in beide Richtungen: unbekannte Verzeichnisse hängen alphabetisch hinten
 * an, verwaiste Einträge fallen weg. Anlegen und Löschen eines Akts müssen die Datei
 * deshalb nicht anfassen.
 */
export function applyActOrder(dirs: string[], order: string[]): string[] {
  const present = new Set(dirs);
  const known = [...new Set(order)].filter((name) => present.has(name));
  const seen = new Set(known);
  const rest = dirs.filter((name) => !seen.has(name)).sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

export async function loadActOrder(actsDir: string): Promise<string[]> {
  try {
    const content = await invoke<string>('read_file_content', { path: `${actsDir}/${ORDER_FILE}` });
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

/** Die einzige Stelle, die Akt-Verzeichnisse aufzählt — sonst driften Seitenleiste, KI-Kontext und Druck. */
export async function listActDirs(actsDir: string): Promise<string[]> {
  const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_entries', { path: actsDir });
  return applyActOrder(
    entries.filter((e) => e.is_dir).map((e) => e.name),
    await loadActOrder(actsDir),
  );
}

export async function saveActOrder(actsDir: string, dirs: string[]): Promise<void> {
  await invoke('write_file_content', {
    path: `${actsDir}/${ORDER_FILE}`,
    content: JSON.stringify(dirs, null, 2) + '\n',
  });
}

/** Verschiebt `dirs[index]` um `delta` Positionen und schreibt die neue Reihenfolge. */
export async function moveAct(
  actsDir: string,
  dirs: string[],
  index: number,
  delta: number,
): Promise<string[]> {
  const target = index + delta;
  if (index < 0 || index >= dirs.length || target < 0 || target >= dirs.length) return dirs;
  const next = [...dirs];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  await saveActOrder(actsDir, next);
  return next;
}
