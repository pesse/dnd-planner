/**
 * Die große Gegenstandskarte (eine Karte, A4) — Inhalt aus `itemCardFacts`, Stil hier.
 */
import type { Item } from '../types';
import { renderMarkdown } from './markdown';
import { itemCardFacts } from './itemCardFacts';
import { RULE_TEXT_PRINT_CSS } from './printCss';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FONT_FAMILY = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";

const ORNDIV = `<div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>`;

const CARD_CSS = `
@page { size: A4 portrait; margin: 16mm; }
* { box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${FONT_FAMILY}; background: white; color: #1a0a00;
       display: flex; justify-content: center; }

.card {
  position: relative;
  width: 120mm;
  border: 0.5mm solid color-mix(in srgb, var(--c) 70%, #6a5a30);
  border-radius: 2.5mm;
  overflow: hidden;
  background: #fef8ec;
  display: flex; flex-direction: column;
}
.card::after {
  content: '';
  position: absolute; inset: 1mm;
  border: 0.2mm solid color-mix(in srgb, var(--c) 55%, transparent);
  border-radius: 2mm; pointer-events: none;
}

.head {
  padding: 4mm 6mm 3mm;
  text-align: center;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--c) 50%, #fef8ec) 0%,
    color-mix(in srgb, var(--c) 9%, #fef8ec) 100%);
}
.name { font-size: 14pt; font-weight: 700; font-variant: small-caps; line-height: 1.2; letter-spacing: 0.02em; }
.name-en { font-size: 8.5pt; font-style: italic; color: #6a5a3a; margin-top: 0.5mm; }
.meta { font-size: 8.5pt; color: color-mix(in srgb, var(--c) 75%, #333); margin-top: 1mm; font-style: italic; }
.subtype { font-size: 7.5pt; color: #897149; margin-top: 0.5mm; text-transform: uppercase; letter-spacing: 0.05em; }
.attune { font-size: 7.5pt; font-weight: 700; color: var(--c); margin-top: 1.2mm; text-transform: uppercase; letter-spacing: 0.04em; }

.orndiv { display: flex; align-items: center; gap: 1.5mm; margin: 2mm 4mm 0; }
.ol { flex: 1; height: 0.3mm; background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent); }
.orndiv .ol:last-child { background: linear-gradient(to left, transparent, var(--c) 30%, var(--c) 70%, transparent); }
.og { font-size: 7pt; color: var(--c); line-height: 1; }

.props { padding: 2mm 6mm 1mm; display: flex; flex-direction: column; gap: 1mm; font-size: 9pt; }
.prop { display: grid; grid-template-columns: 28mm 1fr; gap: 2mm; align-items: baseline; }
.plabel { color: #897149; font-size: 7.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.pills { display: flex; flex-wrap: wrap; gap: 1mm; }
.pill { background: color-mix(in srgb, var(--c) 12%, #fef8ec); border: 0.2mm solid color-mix(in srgb, var(--c) 35%, transparent);
        border-radius: 4mm; font-size: 7.5pt; padding: 0.2mm 2mm; color: #5a4a30; }
.disadv { color: #a82a18; }

.desc { padding: 3mm 6mm; font-size: 9.5pt; line-height: 1.6; }
.desc.muted { color: #b8a777; }
${RULE_TEXT_PRINT_CSS}

.foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 2.5mm 6mm; border-top: 0.3mm solid color-mix(in srgb, var(--c) 40%, transparent);
  background: color-mix(in srgb, var(--c) 6%, #fef8ec);
  font-size: 7.5pt; color: #897149; font-style: italic;
}
.src { text-transform: uppercase; letter-spacing: 0.05em; }
`;


/** Zeigt NUR die deutsche Beschreibung — die englische wird im Druck weggelassen. */
export function prepareItemPrint(item: Item, _doc: Document): string {
  const f = itemCardFacts(item);
  const descHtml = f.description
    ? `<div class="desc"><div class="md">${renderMarkdown(f.description)}</div></div>`
    : `<div class="desc muted">—</div>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(f.title)} – Gegenstand</title>
<style>${CARD_CSS}</style>
</head>
<body>
  <div class="card" style="--c:${f.color}">
    <div class="head">
      <div class="name">${esc(f.title)}</div>
      ${f.nameEn ? `<div class="name-en">${esc(f.nameEn)}</div>` : ''}
      <div class="meta">${esc(f.meta)}</div>
      ${f.subtype ? `<div class="subtype">${esc(f.subtype)}</div>` : ''}
      ${f.attune ? `<div class="attune">${esc(f.attune)}</div>` : ''}
    </div>
    ${ORNDIV}
    ${f.rows.length ? `<div class="props">${f.rows.join('')}</div>${ORNDIV}` : ''}
    ${descHtml}
    <div class="foot"><span class="src">${esc(f.source)}</span><span>${esc(f.price)}</span></div>
  </div>
</body>
</html>`;
}
