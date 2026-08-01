// Interne Navigation über Markdown-Links zwischen Vault-Dateien: Ziel relativ zur
// offenen Datei auflösen, Typ aus dem Pfad ableiten, über den Guard öffnen. Karten-Typen
// laden ihren Inhalt selbst via activeFile; nur Editor-Typen brauchen setFileContent.

import { invoke } from '@tauri-apps/api/core';
import { activeFile, setFileContent } from '../stores/campaign';
import { confirmNavigation } from '../stores/navigationGuard';
import { loadActSummaries } from '../stores/context';
import type { FileEntry } from '../types';

const EDITOR_TYPES = new Set<FileEntry['type']>(['campaign', 'act', 'session', 'world', 'notes']);

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//');
}

/** Ergebnis ist immer die `./vault/…`-Form, die die Tauri-Kommandos erwarten. */
export function resolveVaultPath(fromFilePath: string, href: string): string {
  const cleanHref = href.split('#')[0].split('?')[0];
  const baseDir = fromFilePath.replace(/\/[^/]*$/, '');
  const segments = `${baseDir}/${cleanHref}`.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return './' + out.join('/');
}

/** Die eine Stelle, die aus einem Vault-Pfad einen Dateityp macht. */
export function inferFileType(path: string): FileEntry['type'] | null {
  if (/\/campaign\.md$/i.test(path)) return 'campaign';
  if (/\/acts\/[^/]+\/index\.md$/i.test(path)) return 'act';
  if (/\/acts\/[^/]+\/encounters\/[^/]+\.json$/i.test(path)) return 'encounter';
  if (/\/acts\/[^/]+\/monsters\/[^/]+\.json$/i.test(path)) return 'monster';
  if (/\/encounters\/[^/]+\.json$/i.test(path)) return 'encounter';
  if (/\/npcs\/[^/]+\.json$/i.test(path)) return 'npc';
  if (/\/sessions\/[^/]+\.md$/i.test(path)) return 'session';
  if (/\/world\/[^/]+\.md$/i.test(path)) return 'world';
  if (/\/notes\/[^/]+\.md$/i.test(path)) return 'notes';
  if (/\/vault\/monsters\/.+\.json$/i.test(path)) return 'monster';
  if (/\/vault\/spells\/.+\.json$/i.test(path)) return 'spell';
  if (/\/vault\/items\/.+\.json$/i.test(path)) return 'item';
  if (/\/vault\/classes\/[^/]+\.json$/i.test(path)) return 'class';
  if (/\/vault\/species\/[^/]+\.json$/i.test(path)) return 'species';
  if (/\/vault\/feats\/[^/]+\.json$/i.test(path)) return 'feat';
  if (/\/vault\/backgrounds\/[^/]+\.json$/i.test(path)) return 'background';
  // Charaktere sind verzeichnisbasiert, tragen also kein Suffix.
  if (/\/vault\/characters\/[^/]+\/?$/i.test(path)) return 'character';
  if (/\.md$/i.test(path)) return 'notes';
  return null;
}

export async function openItemPage(item: { name: string; path: string }): Promise<void> {
  if (!(await confirmNavigation())) return;
  const name = item.path.split('/').pop()?.replace('.json', '') ?? item.name;
  activeFile.set({ name, path: item.path, type: 'item' });
}

/** Muss dem Sidebar-Öffnen gleichen: beim Akt der Verzeichnis-Slug, sonst der Dateiname. */
function displayName(path: string, type: FileEntry['type']): string {
  if (type === 'campaign') return 'campaign';
  if (type === 'act') {
    const m = path.match(/\/acts\/([^/]+)\/index\.md$/i);
    return m ? m[1] : 'index';
  }
  const base = path.split('/').pop() ?? '';
  return base.replace(/\.(md|json)$/i, '');
}

/**
 * `campaignPath` reicht der Aufrufer aus dem Store herein — nur für den Akt-Seiteneffekt.
 * @returns true = intern behandelt, auch wenn der Guard abbricht; false nur bei externen
 *          oder nicht auflösbaren Links, die der Aufrufer dann selbst öffnen darf.
 */
export async function openVaultLink(
  href: string,
  fromFilePath: string,
  campaignPath?: string,
): Promise<boolean> {
  if (!href || !fromFilePath || isExternal(href)) return false;

  let decoded = href;
  try { decoded = decodeURI(href); } catch { /* href bereits dekodiert */ }

  const target = resolveVaultPath(fromFilePath, decoded);
  const type = inferFileType(target);
  if (!type) return false;

  if (!(await confirmNavigation())) return true; // Abbruch wegen ungespeicherter Änderungen

  const cleanTarget = type === 'character' ? target.replace(/\/$/, '') : target;
  const entry: FileEntry = { name: displayName(cleanTarget, type), path: cleanTarget, type };
  if (type === 'character') entry.dirPath = cleanTarget;
  activeFile.set(entry);

  if (type === 'character') {
    // CharacterSheet lädt aus dirPath selbst; alten Markdown-Inhalt leeren.
    setFileContent('');
  } else if (EDITOR_TYPES.has(type)) {
    try {
      const content = await invoke<string>('read_file_content', { path: cleanTarget });
      setFileContent(content);
    } catch (e) {
      setFileContent(`# Fehler\n\nDatei konnte nicht geladen werden: ${e}`);
    }
  }

  // Nur der Akt lädt Kontext nach, genau wie die Sidebar. Karten-Typen tun das bewusst
  // nicht — sonst verhielte sich die Link-Navigation anders als die erprobte Sidebar.
  if (type === 'act' && campaignPath) loadActSummaries(campaignPath);

  return true;
}
