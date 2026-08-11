import type { Spell } from '../types';
import { spellComponents, spellDesc, spellHigherLevel, spellLevelLabel, spellSchoolLabel } from '../types';
import { renderMarkdownInline } from './markdown';
import { createHtmlFitter, paginateMarkdown } from './paginateMarkdown';
import {
  CARD_CSS,
  DESC_PADDING,
  DESC_WIDTH,
  FONT_FAMILY,
  FONT_SIZE,
  LINE_HEIGHT,
} from './printSpellCss';

const SCHOOL_COLORS: Record<string, string> = {
  abjuration:    '#6a9fd8',
  conjuration:   '#5aaa6a',
  divination:    '#c8a020',
  enchantment:   '#c060a0',
  evocation:     '#c83030',
  illusion:      '#30a0b8',
  necromancy:    '#8858c8',
  transmutation: '#c07030',
};

const CLASS_LABELS: Record<string, string> = {
  sorcerer: 'Zauberer', wizard: 'Magier', bard: 'Barde', druid: 'Druide',
  ranger: 'Waldläufer', cleric: 'Kleriker', warlock: 'Hexenmeister', paladin: 'Paladin',
};

// Unicode, kein Emoji — sonst bricht die Serifenschrift des Bogens auf Farbglyphen um.
const ICONS = {
  casting_time: '⚡',
  range:        '◎',
  components:   '✦',
  duration:     '⌛',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function levelLabel(level: number): string {
  return spellLevelLabel(level);
}

/**
 * Misst die Höhe des Beschreibungsbereichs an leeren Karten im unsichtbaren DOM, statt
 * sie zu schätzen: wie viele Zeilen der Props-Block braucht, steht erst nach dem Umbruch fest.
 */
function measureDescHeights(spell: Spell, doc: Document): { firstH: number; contH: number } {
  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';

  const styleEl = doc.createElement('style');
  styleEl.textContent = CARD_CSS;
  wrapper.appendChild(styleEl);

  // Beide Schalen ohne Text: `.desc` hat flex:1 und meldet damit den freien Rest.
  wrapper.insertAdjacentHTML('beforeend', renderFirstCard(spell, '', false));
  wrapper.insertAdjacentHTML('beforeend', renderContCard(spell, '', 2, false));

  doc.body.appendChild(wrapper);

  const descs = wrapper.querySelectorAll('.desc');
  const firstH = (descs[0] as HTMLElement | null)?.clientHeight ?? 180;
  const contH  = (descs[1] as HTMLElement | null)?.clientHeight ?? 300;

  doc.body.removeChild(wrapper);
  return { firstH, contH };
}

/** Der „Auf höheren Graden."-Zusatz wird mitgemessen, sonst läuft er aus der letzten Karte. */
function paginateDescription(spell: Spell, firstH: number, contH: number, doc: Document): string[] {
  const description = spellDesc(spell);
  if (!description) return [''];

  const fitter = createHtmlFitter({
    doc,
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    width: DESC_WIDTH,
    padding: DESC_PADDING, // identisch zur .desc-Klasse — sonst zu viel Text gemessen
  });

  try {
    return paginateMarkdown(description, {
      heightOf: (page) => (page === 0 ? firstH : contH),
      fits: fitter.fits,
      tailHtml: higherHtmlOf(spell),
    });
  } finally {
    fitter.destroy();
  }
}

const ORNDIV = `<div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>`;

function abbrev(s: string): string {
  return s.replace(/Konzentration, /g, 'Konz. ');
}

function higherHtmlOf(spell: Spell): string {
  const higherLvl = spellHigherLevel(spell);
  if (!higherLvl) return '';
  return `\n<div class="higher"><span class="higher-lbl">Auf höheren Graden.</span> <span class="md md-inline">${renderMarkdownInline(higherLvl)}</span></div>`;
}

function renderFirstCard(spell: Spell, descHtml: string, isLast: boolean): string {
  const color  = SCHOOL_COLORS[spell.school] ?? '#888';
  const comps  = spellComponents(spell);
  const matNote = spell.components.materials_needed
    ? ` <span class="mat">(${esc(spell.components.materials_needed)})</span>` : '';
  const classes = spell.classes.map(c => CLASS_LABELS[c] ?? c).join(' · ');
  const higherHtml = isLast ? higherHtmlOf(spell) : '';

  return `<div class="card" style="--c:${color}">

  <div class="head">
    <div class="name">${esc(spell.name)}${spell.ritual ? ' <span class="ritual">Ritual</span>' : ''}</div>
    <div class="meta">${esc(levelLabel(spell.level))} · ${esc(spellSchoolLabel(spell.school))}</div>
  </div>
  ${ORNDIV}
  <div class="props">
    <div class="prop-row"><span class="pc"><span class="icon">${ICONS.casting_time}</span>${esc(spell.casting_time)}</span><span class="pc"><span class="icon">${ICONS.range}</span>${esc(spell.range)}</span><span class="pc"><span class="icon">${ICONS.duration}</span>${esc(abbrev(spell.duration))}</span></div>
    <div class="prop"><span class="icon">${ICONS.components}</span>${esc(comps)}${matNote}</div>
  </div>
  ${ORNDIV}
  <div class="desc md">${descHtml}${higherHtml}</div>
  <div class="foot">${esc(classes)}</div>
</div>`;
}

function renderContCard(spell: Spell, descHtml: string, pageNum: number, isLast: boolean): string {
  const color = SCHOOL_COLORS[spell.school] ?? '#888';
  const higherHtml = isLast ? higherHtmlOf(spell) : '';

  return `<div class="card cont" style="--c:${color}">

  <div class="head-cont">
    <span class="name-sm">${esc(spell.name)}</span>
    <span class="cont-lbl">(${pageNum})</span>
  </div>
  ${ORNDIV}
  <div class="desc desc-full md">${descHtml}${higherHtml}</div>
</div>`;
}

function renderEmptyCard(): string {
  return '<div class="card empty"></div>';
}

function cardsOf(spell: Spell, chunks: string[]): string[] {
  return chunks.map((chunk, i) => {
    const isLast = i === chunks.length - 1;
    return i === 0
      ? renderFirstCard(spell, chunk, isLast)
      : renderContCard(spell, chunk, i + 1, isLast);
  });
}

/** Angebrochene Seiten füllen Leerkarten auf (3×3-Raster). */
function pagesOf(cards: string[], pageClass: string): string[] {
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 9) {
    const batch = cards.slice(i, i + 9);
    while (batch.length < 9) batch.push(renderEmptyCard());
    pages.push(`<div class="${pageClass}">\n${batch.join('\n')}\n</div>`);
  }
  return pages;
}

const measuredCards = (spells: Spell[], doc: Document): string[] =>
  spells.flatMap((spell) => {
    const { firstH, contH } = measureDescHeights(spell, doc);
    return cardsOf(spell, paginateDescription(spell, firstH, contH, doc));
  });

/** `title` ist bereits escaped. */
function printDocument(title: string, cards: string[]): string {
  const pages = pagesOf(cards, 'page');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${CARD_CSS}</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

/** `chunks` sind die bereits per DOM-Messung aufgeteilten Beschreibungstexte. */
export function buildSpellPrintHtml(spell: Spell, chunks: string[]): string {
  return printDocument(`${esc(spell.name)} – Zauberkarte`, cardsOf(spell, chunks));
}

export function prepareMultiSpellPrint(spells: Spell[], doc: Document): string {
  const title = spells[0] ? `${esc(spells[0].name)} u.a. – Zauberkarten` : 'Zauberkarten';
  return printDocument(title, measuredCards(spells, doc));
}

/**
 * Kartenseiten ohne Dokumenthülle, für ein fremdes Stylesheet: der Charakterbogen hängt sie
 * an und benennt das Raster selbst, weil sein `.page` etwas anderes ist.
 */
export const spellCardPages = (spells: Spell[], doc: Document, pageClass: string): string =>
  pagesOf(measuredCards(spells, doc), pageClass).join('\n');

export function prepareSpellPrint(spell: Spell, doc: Document): string {
  const { firstH, contH } = measureDescHeights(spell, doc);
  return buildSpellPrintHtml(spell, paginateDescription(spell, firstH, contH, doc));
}
