/**
 * Die Zauberkarte als Schale für `printCards.ts` — Kopf, Werte, Fuß. Wie viel Text auf eine
 * Karte passt, entscheidet dort die Messung.
 */
import type { Spell } from '../types';
import { spellComponents, spellDesc, spellHigherLevel, spellLevelLabel, spellSchoolLabel } from '../types';
import { renderMarkdownInline } from './markdown';
import { cardDocument, embeddedCardPages, measuredCards, type CardShell } from './printCards';

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

const spellCardShell = (spell: Spell): CardShell => ({
  render: (descHtml, page, isLast) =>
    page === 0
      ? renderFirstCard(spell, descHtml, isLast)
      : renderContCard(spell, descHtml, page + 1, isLast),
  description: spellDesc(spell),
  tail: higherHtmlOf(spell),
});

export function prepareMultiSpellPrint(spells: Spell[], doc: Document): string {
  const title = spells[0] ? `${esc(spells[0].name)} u.a. – Zauberkarten` : 'Zauberkarten';
  return cardDocument(title, measuredCards(spells.map(spellCardShell), doc));
}

export const spellCardPages = (spells: Spell[], doc: Document, pageClass: string): string =>
  embeddedCardPages(spells.map(spellCardShell), doc, pageClass);

export function prepareSpellPrint(spell: Spell, doc: Document): string {
  const cards = measuredCards([spellCardShell(spell)], doc);
  return cardDocument(`${esc(spell.name)} – Zauberkarte`, cards);
}
