// Interne Navigation über Standard-Markdown-Links zwischen Vault-Dateien.
//
// Ein Link wie [Dorfzentrum](world/dorfzentrum.md) in einer Akt-/Kampagnendatei
// wird relativ zur gerade geöffneten Datei aufgelöst, der Zieltyp aus dem Pfad
// abgeleitet und – wie beim Klick in der Sidebar – mit Navigations-Guard geöffnet.
// Karten-Typen (npc/monster/encounter/spell/item/character) laden ihren Inhalt
// selbst via activeFile-Subscription; nur Editor-Typen brauchen setFileContent.

import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { activeFile, activeCampaign, setFileContent } from '../stores/campaign';
import { confirmNavigation } from '../stores/navigationGuard';
import { loadActSummaries } from '../stores/context';
import type { FileEntry } from '../types';

/** Typen, deren Inhalt im Markdown-Editor angezeigt wird (brauchen setFileContent). */
const EDITOR_TYPES = new Set<FileEntry['type']>(['campaign', 'act', 'session', 'world', 'notes']);

/** true für externe/Anker-Links, die nicht intern navigiert werden. */
function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//');
}

/** Relativen Link gegen die Quelldatei auflösen; gibt einen `./vault/...`-Pfad zurück. */
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

/** Dateityp aus dem Vault-Pfad ableiten (Single Source für die Routing-Logik). */
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
  // Globale Bibliotheken
  if (/\/vault\/monsters\/.+\.json$/i.test(path)) return 'monster';
  if (/\/vault\/spells\/.+\.json$/i.test(path)) return 'spell';
  if (/\/vault\/items\/.+\.json$/i.test(path)) return 'item';
  // Charaktere: verzeichnisbasiert (./vault/characters/<slug>), kein Suffix.
  if (/\/vault\/characters\/[^/]+\/?$/i.test(path)) return 'character';
  // Fallback: jede andere .md als Notiz behandeln
  if (/\.md$/i.test(path)) return 'notes';
  return null;
}

/** Anzeigename wie beim Sidebar-Öffnen (Akt = Verzeichnis-Slug, sonst Dateiname). */
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
 * Öffnet das Ziel eines Markdown-Links innerhalb der App.
 * @returns true, wenn der Link intern behandelt wurde (auch bei Abbruch durch den
 *          Guard); false bei externen/nicht auflösbaren Links – der Aufrufer kann
 *          dann z.B. im System-Browser öffnen.
 */
export async function openVaultLink(href: string, fromFilePath: string): Promise<boolean> {
  if (!href || !fromFilePath || isExternal(href)) return false;

  let decoded = href;
  try { decoded = decodeURI(href); } catch { /* href bereits dekodiert */ }

  const target = resolveVaultPath(fromFilePath, decoded);
  const type = inferFileType(target);
  if (!type) return false;

  if (!(await confirmNavigation())) return true; // Abbruch wegen ungespeicherter Änderungen

  // Charaktere sind verzeichnisbasiert (PDF/JSON); ein evtl. Schrägstrich am Ende weg.
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

  // Kontext-Seiteneffekt nur fürs KI-Panel beim Akt – exakt wie die Sidebar beim
  // Öffnen eines Akts (openFile). Encounter/NPC/Karten lösen bewusst keinen
  // Kontext-Reload aus (die laufen nur bei Kampagnen-Wechsel), damit die Navigation
  // sich identisch zur erprobten Sidebar verhält.
  if (type === 'act') {
    const campaignPath = get(activeCampaign)?.path;
    if (campaignPath) loadActSummaries(campaignPath);
  }

  return true;
}
