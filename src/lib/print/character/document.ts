/**
 * Die Hülle: gewählte Sektionen → Seiten → ein eigenständiges HTML-Dokument. Genau dieser
 * String steht in der Vorschau und geht an `printHtmlDocument` — Vorschau und Druck sind
 * dieselbe Variable, nicht zwei Wege.
 */
import type { CharacterPrintData } from './data';
import { BLOCK_CSS } from './css/blocks';
import { CARDS_CSS } from './css/cards';
import { FRAME_CSS } from './css/frames';
import { OVERVIEW_CSS } from './css/overview';
import { PAGE_CSS } from './css/page';
import { esc } from './html';
import { sheetSections, type SheetPageId, type SheetSection } from './sections';

export interface SheetSelection {
  [sectionId: string]: boolean;
}

const isOn = (selection: SheetSelection, s: SheetSection): boolean => selection[s.id] !== false;

/**
 * Ein Eintrag = ein Satz Blätter, jeder fängt vorne an. Merkmale und Zauber teilen sich einen:
 * getrennt bleibt von beiden je eine halbe Seite weiß.
 */
const SHEET_GROUPS: SheetPageId[][] = [['overview'], ['details', 'spells', 'pinned'], ['spellCards']];

/**
 * Übersicht und Zauberkarten bringen ihr eigenes Seitenraster mit und werden nicht in den
 * Spaltenfluss gewickelt — der Rest ist zweispaltiger Kastensatz.
 */
const SELF_LAID: SheetPageId[] = ['overview', 'spellCards'];

function renderGroup(d: CharacterPrintData, pages: SheetPageId[], sections: SheetSection[]): string {
  const body = pages
    .flatMap((page) => sections.filter((s) => s.page === page))
    .map((s) => s.render(d)).join('');
  if (!body.trim()) return '';
  if (pages.some((p) => SELF_LAID.includes(p))) return body;
  // Nur die Übersicht trägt den Namen groß; ohne diese Zeile ist ein Folgeblatt am Tisch
  // keinem Bogen mehr zuzuordnen.
  const head = `<div class="page-head">${esc(d.character.name)}</div>`;
  return `<div class="page">${head}${body}</div>`;
}

/** Die Blätter, für die mindestens eine Sektion gewählt ist — in der Reihenfolge von `SHEET_GROUPS`. */
export function buildCharacterSheetHtml(d: CharacterPrintData, selection: SheetSelection): string {
  const chosen = sheetSections(d).filter((s) => isOn(selection, s));
  const pages = SHEET_GROUPS.map((g) => renderGroup(d, g, chosen)).filter(Boolean).join('');
  const cards = chosen.some((s) => s.page === 'spellCards') ? CARDS_CSS : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(d.character.name)} – Charakterbogen</title>
<style>${PAGE_CSS}${OVERVIEW_CSS}${BLOCK_CSS}${FRAME_CSS}${cards}</style>
</head>
<body>${pages}</body>
</html>`;
}
