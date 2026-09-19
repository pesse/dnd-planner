/**
 * Die Gegenstandskarte im 3×3-Raster des Bogens — dieselbe Schale wie die Zauberkarte,
 * gefüllt aus `itemCardFacts`.
 */
import type { Item } from '../types';
import { itemCardFacts, type ItemCardFacts } from './itemCardFacts';
import { embeddedCardPages, type CardShell } from './printCards';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ORNDIV = `<div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>`;

function renderFirstCard(f: ItemCardFacts, descHtml: string): string {
  return `<div class="card" style="--c:${f.color}">

  <div class="head">
    <div class="name">${esc(f.title)}</div>
    ${f.meta ? `<div class="meta">${esc(f.meta)}</div>` : ''}
    ${f.subtype ? `<div class="subtype">${esc(f.subtype)}</div>` : ''}
    ${f.attune ? `<div class="attune">${esc(f.attune)}</div>` : ''}
  </div>
  ${ORNDIV}
  ${f.rows.length ? `<div class="props">${f.rows.join('')}</div>${ORNDIV}` : ''}
  <div class="desc md">${descHtml}</div>
  <div class="foot">${esc([f.source, f.price].filter(Boolean).join(' · '))}</div>
</div>`;
}

function renderContCard(f: ItemCardFacts, descHtml: string, pageNum: number): string {
  return `<div class="card cont" style="--c:${f.color}">

  <div class="head-cont">
    <span class="name-sm">${esc(f.title)}</span>
    <span class="cont-lbl">(${pageNum})</span>
  </div>
  ${ORNDIV}
  <div class="desc desc-full md">${descHtml}</div>
</div>`;
}

const itemCardShell = (item: Item): CardShell => {
  const f = itemCardFacts(item, true);
  return {
    render: (descHtml, page) =>
      page === 0 ? renderFirstCard(f, descHtml) : renderContCard(f, descHtml, page + 1),
    description: f.description,
  };
};

export const itemCardPages = (items: Item[], doc: Document, pageClass: string): string =>
  embeddedCardPages(items.map(itemCardShell), doc, pageClass);
