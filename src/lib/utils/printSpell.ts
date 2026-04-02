import type { Spell } from '../types';
import { spellDesc, spellHigherLevel, spellLevelLabel } from '../types';

// ── Konstanten ────────────────────────────────────────────────────────────────

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

const SCHOOL_LABELS: Record<string, string> = {
  abjuration:    'Bannmagie',
  conjuration:   'Beschwörung',
  divination:    'Erkenntnismagie',
  enchantment:   'Verzauberung',
  evocation:     'Hervorrufung',
  illusion:      'Illusionsmagie',
  necromancy:    'Nekromantie',
  transmutation: 'Verwandlung',
};

const CLASS_LABELS: Record<string, string> = {
  sorcerer: 'Zauberer', wizard: 'Magier', bard: 'Barde', druid: 'Druide',
  ranger: 'Waldläufer', cleric: 'Kleriker', warlock: 'Hexenmeister', paladin: 'Paladin',
};

// Prop-Icons (Unicode, kein Emoji — rendert als Text in Palatino/Georgia)
const ICONS = {
  casting_time: '⚡',
  range:        '◎',
  components:   '✦',
  duration:     '⌛',
};

const FONT_FAMILY   = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";
const FONT_SIZE     = '7pt';
const LINE_HEIGHT   = '1.38';
// Mess-Div muss exakt die .desc-Geometrie nachbilden:
// Kartenbreite 70mm - Border ~0.9mm - 2×5mm Padding = ~59mm Textbreite.
// Mit box-sizing:border-box + padding:1mm 5mm → width:69mm ergibt Textbreite 59mm.
const DESC_WIDTH    = '69mm';
const DESC_PADDING  = '1mm 5mm';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function levelLabel(level: number): string {
  return spellLevelLabel(level);
}

function componentStr(s: Spell): string {
  const parts: string[] = [];
  if (s.components.verbal)   parts.push('V');
  if (s.components.somatic)  parts.push('G');
  if (s.components.material) parts.push('M');
  return parts.join(', ') || '—';
}

// ── DOM-basiertes Text-Splitting ──────────────────────────────────────────────

/**
 * Findet per Binärsuche die längste Teilmenge von `text`, die in `el` passt
 * (scrollHeight ≤ clientHeight). Schneidet an Wort- oder Zeilengrenzen.
 */
function measureFit(text: string, el: HTMLDivElement): string {
  el.textContent = text;
  if (el.scrollHeight <= el.clientHeight + 2) return text; // passt komplett

  // Alle gültigen Schnittposition: direkt nach einem Leerzeichen oder Zeilenumbruch
  const positions: number[] = [0];
  for (let i = 1; i < text.length; i++) {
    const ch = text[i - 1];
    if (ch === ' ' || ch === '\n') positions.push(i);
  }
  positions.push(text.length);

  let lo = 0;
  let hi = positions.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    el.textContent = text.slice(0, positions[mid]);
    if (el.scrollHeight <= el.clientHeight + 2) lo = mid;
    else hi = mid;
  }

  return text.slice(0, positions[lo]).trimEnd();
}

/**
 * Rendert Karten-Schalen (ohne Beschreibungstext) in einem unsichtbaren DOM-Element
 * und liest die tatsächliche Höhe des Beschreibungsbereichs über clientHeight aus.
 * So passt die Messung immer — unabhängig davon, wie viele Zeilen Props benötigen.
 */
function measureDescHeights(spell: Spell, doc: Document): { firstH: number; contH: number } {
  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';

  const styleEl = doc.createElement('style');
  styleEl.textContent = CARD_CSS;
  wrapper.appendChild(styleEl);

  // Erste Karte ohne Beschreibungstext — desc bekommt flex:1 und füllt den Rest
  wrapper.insertAdjacentHTML('beforeend', renderFirstCard(spell, '', false));
  // Fortsetzungskarte
  wrapper.insertAdjacentHTML('beforeend', renderContCard(spell, '', 2, false));

  doc.body.appendChild(wrapper);

  const descs = wrapper.querySelectorAll('.desc');
  const firstH = (descs[0] as HTMLElement | null)?.clientHeight ?? 180;
  const contH  = (descs[1] as HTMLElement | null)?.clientHeight ?? 300;

  doc.body.removeChild(wrapper);
  return { firstH, contH };
}

/**
 * Teilt `description` in Textblöcke auf, die exakt in die Karten passen.
 * Nutzt ein unsichtbares DOM-Element mit denselben Schrift-/Größeneinstellungen.
 * Keine Schätzungen — der Browser misst den tatsächlichen Überlauf.
 */
function splitDescription(description: string, firstH: number, contH: number, doc: Document): string[] {
  if (!description) return [''];

  const el = doc.createElement('div') as HTMLDivElement;
  el.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:-9999px',
    `font-family:${FONT_FAMILY}`,
    `font-size:${FONT_SIZE}`,
    `line-height:${LINE_HEIGHT}`,
    'white-space:pre-wrap',
    'word-break:break-word',
    'overflow:hidden',
    'box-sizing:border-box',
    `width:${DESC_WIDTH}`,
    `padding:${DESC_PADDING}`,  // identisch zur .desc-Klasse — sonst zu viel Text gemessen
  ].join(';');
  doc.body.appendChild(el);

  const chunks: string[] = [];
  let remaining = description;
  let isFirst = true;

  try {
    while (remaining.length > 0) {
      el.style.height = `${isFirst ? firstH : contH}px`;

      const chunk = measureFit(remaining, el);

      // Sicherheitsnetz: falls nichts passt (extrem langes Wort), hart schneiden
      if (!chunk && remaining.length > 0) {
        chunks.push(remaining.slice(0, 60));
        remaining = remaining.slice(60).trimStart();
      } else {
        chunks.push(chunk);
        remaining = remaining.slice(chunk.length).trimStart();
      }

      isFirst = false;
    }
  } finally {
    doc.body.removeChild(el);
  }

  return chunks;
}

// ── Karten-HTML ───────────────────────────────────────────────────────────────

// Ornamentaler Trenner: Linie — ✦ — Linie (in Schulfarbe)
const ORNDIV = `<div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>`;

function abbrev(s: string): string {
  return s.replace(/Konzentration, /g, 'Konz. ');
}

function renderFirstCard(spell: Spell, descText: string, isLast: boolean): string {
  const color  = SCHOOL_COLORS[spell.school] ?? '#888';
  const comps  = componentStr(spell);
  const matNote = spell.components.materials_needed
    ? ` <span class="mat">(${esc(spell.components.materials_needed)})</span>` : '';
  const classes = spell.classes.map(c => CLASS_LABELS[c] ?? c).join(' · ');
  const higherLvl = spellHigherLevel(spell);
  const higherHtml = (isLast && higherLvl)
    ? `\n<div class="higher"><span class="higher-lbl">Auf höheren Graden.</span> ${esc(higherLvl)}</div>`
    : '';

  return `<div class="card" style="--c:${color}">

  <div class="head">
    <div class="name">${esc(spell.name)}${spell.ritual ? ' <span class="ritual">Ritual</span>' : ''}</div>
    <div class="meta">${esc(levelLabel(spell.level))} · ${esc(SCHOOL_LABELS[spell.school] ?? spell.school)}</div>
  </div>
  ${ORNDIV}
  <div class="props">
    <div class="prop-row"><span class="pc"><span class="icon">${ICONS.casting_time}</span>${esc(spell.casting_time)}</span><span class="pc"><span class="icon">${ICONS.range}</span>${esc(spell.range)}</span><span class="pc"><span class="icon">${ICONS.duration}</span>${esc(abbrev(spell.duration))}</span></div>
    <div class="prop"><span class="icon">${ICONS.components}</span>${esc(comps)}${matNote}</div>
  </div>
  ${ORNDIV}
  <div class="desc">${esc(descText)}${higherHtml}</div>
  <div class="foot">${esc(classes)}</div>
</div>`;
}

function renderContCard(spell: Spell, descText: string, pageNum: number, isLast: boolean): string {
  const color = SCHOOL_COLORS[spell.school] ?? '#888';
  const higherLvl = spellHigherLevel(spell);
  const higherHtml = (isLast && higherLvl)
    ? `\n<div class="higher"><span class="higher-lbl">Auf höheren Graden.</span> ${esc(higherLvl)}</div>`
    : '';

  return `<div class="card cont" style="--c:${color}">

  <div class="head-cont">
    <span class="name-sm">${esc(spell.name)}</span>
    <span class="cont-lbl">(${pageNum})</span>
  </div>
  ${ORNDIV}
  <div class="desc desc-full">${esc(descText)}${higherHtml}</div>
</div>`;
}

function renderEmptyCard(): string {
  return '<div class="card empty"></div>';
}

// ── CSS der gedruckten Karten ─────────────────────────────────────────────────

const CARD_CSS = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${FONT_FAMILY}; background: white; color: #1a0a00; }

.page {
  width: 210mm; height: 297mm;
  display: grid;
  grid-template-columns: repeat(3, 70mm);
  grid-template-rows: repeat(3, 99mm);
  page-break-after: always; break-after: page;
}
.page:last-child { page-break-after: auto; break-after: auto; }

/* ── Karte ─────────────────────────────────────────────── */
.card {
  position: relative;
  width: 70mm; height: 99mm;
  border: 0.45mm solid #9a7a3a;  /* neutraler Rahmen — Farbe nicht per Schule */
  border-radius: 2.5mm;
  display: flex; flex-direction: column;
  overflow: hidden;
  background: #fef8ec;
}
/* Innerer Zierrahmen */
.card::after {
  content: '';
  position: absolute;
  inset: 1mm;
  border: 0.2mm solid #c4a050;
  border-radius: 2mm;
  pointer-events: none;
  z-index: 5;
}
.card.empty { background: #f5f5f0; border-color: #bbb; }
.card.empty::after { display: none; }

/* Header-Verlauf — Schulfarbe nur hier */
.stripe { display: none; }

/* ── Header — zentriert ─────────────────────────────────── */
.head {
  padding: 2mm 5mm 1.8mm;
  text-align: center;
  flex-shrink: 0;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--c) 55%, #fef8ec) 0%,
    color-mix(in srgb, var(--c) 10%, #fef8ec) 100%);
}
.name {
  font-size: 8.5pt; font-weight: 700; font-variant: small-caps;
  color: #1a0a00; line-height: 1.2; letter-spacing: 0.02em;
}
.ritual {
  font-size: 5pt; font-weight: 700; font-variant: normal;
  background: var(--c); color: white;
  border-radius: 0.8mm; padding: 0.2mm 1mm;
  vertical-align: middle; text-transform: uppercase; letter-spacing: 0.06em;
}
.meta {
  font-size: 5.5pt; color: color-mix(in srgb, var(--c) 80%, #333);
  margin-top: 0.4mm; font-style: italic;
}

/* ── Ornamentaler Trenner ──────────────────────────────── */
.orndiv {
  display: flex; align-items: center; gap: 1.5mm;
  margin: 0 3.5mm 0; flex-shrink: 0;
}
.ol {
  flex: 1; height: 0.3mm;
  background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent);
}
/* Zweite Linie spiegeln */
.orndiv .ol:last-child {
  background: linear-gradient(to left, transparent, var(--c) 30%, var(--c) 70%, transparent);
}
.og {
  font-size: 5.5pt; color: var(--c); line-height: 1;
  font-style: normal; font-variant: normal;
}

/* ── Props ─────────────────────────────────────────────── */
.props {
  padding: 0.8mm 5mm;
  flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.5mm;
}
/* Zauberdauer · Reichweite · Dauer: inline, bricht natürlich um */
.prop-row { font-size: 6pt; line-height: 1.3; }
.pc {
  display: inline;
  margin-right: 2.5mm;
}
.pc .icon { margin-right: 0.7mm; }
/* Komponenten-Zeile */
.prop {
  font-size: 6pt; line-height: 1.3;
  display: flex; align-items: baseline; gap: 1.5mm;
}
.icon {
  font-size: 7pt; color: var(--c);
  flex-shrink: 0; width: 3mm; text-align: center;
  font-style: normal; font-variant: normal; display: inline;
}
.mat { color: #888; font-style: italic; }

/* ── Beschreibung ──────────────────────────────────────── */
.desc {
  flex: 1;
  padding: 1mm 5mm 1mm;
  font-size: ${FONT_SIZE};
  line-height: ${LINE_HEIGHT};
  color: #1a0a00;
  white-space: pre-wrap;
  overflow: hidden;
  min-height: 0;
}
.desc-full { padding-top: 1.2mm; }

.higher {
  margin-top: 1.2mm;
  font-size: 6pt; line-height: 1.3;
  color: #3a2800; white-space: pre-wrap;
}
.higher-lbl { font-weight: 700; color: var(--c); }

/* ── Footer ───────────────────────────────────────────── */
.foot {
  height: 5.5mm;
  display: flex; align-items: center; justify-content: center;
  padding-bottom: 1.2mm;
  font-size: 5.5pt; color: #888; font-style: italic;
  border-top: 0.3mm solid #c4a050;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--c) 6%, #fef8ec);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Fortsetzungskarte ────────────────────────────────── */
.head-cont {
  padding: 2.5mm 5mm 1mm;
  display: flex; align-items: baseline; gap: 1.5mm;
  flex-shrink: 0;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--c) 30%, #fef8ec) 0%,
    color-mix(in srgb, var(--c) 6%, #fef8ec) 100%);
  justify-content: center;
}
.name-sm {
  font-size: 7.5pt; font-weight: 700; font-variant: small-caps; color: #1a0a00;
}
.cont-lbl { font-size: 5.5pt; color: #aaa; font-style: italic; }
`;

// ── Haupt-Export ──────────────────────────────────────────────────────────────

/**
 * Generiert druckbares HTML für die Zauberkarten eines Zaubers.
 * `chunks` sind die bereits per DOM-Messung aufgeteilten Beschreibungstexte.
 */
export function buildSpellPrintHtml(spell: Spell, chunks: string[]): string {
  const cards: string[] = chunks.map((chunk, i) => {
    const isLast = i === chunks.length - 1;
    return i === 0
      ? renderFirstCard(spell, chunk, isLast)
      : renderContCard(spell, chunk, i + 1, isLast);
  });

  // 9 Karten pro A4-Seite (3×3)
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 9) {
    const batch = cards.slice(i, i + 9);
    while (batch.length < 9) batch.push(renderEmptyCard());
    pages.push(`<div class="page">\n${batch.join('\n')}\n</div>`);
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(spell.name)} – Zauberkarte</title>
<style>${CARD_CSS}</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

/**
 * Prüft, ob `higher_levels` nach `descText` noch auf dieselbe Karte passt.
 * Repliziert die tatsächliche Render-Struktur: desc-Text + .higher-Div mit
 * kleinerer Schrift, damit die Messung der echten Ausgabe entspricht.
 */
function higherLevelsFits(descText: string, higherLevels: string, heightPx: number, doc: Document): boolean {
  const el = doc.createElement('div') as HTMLDivElement;
  el.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:-9999px',
    `font-family:${FONT_FAMILY}`,
    `font-size:${FONT_SIZE}`,
    `line-height:${LINE_HEIGHT}`,
    'white-space:pre-wrap',
    'word-break:break-word',
    'overflow:hidden',
    'box-sizing:border-box',
    `width:${DESC_WIDTH}`,
    `padding:${DESC_PADDING}`,
    `height:${heightPx}px`,
  ].join(';');

  el.textContent = descText;

  // .higher-Div nachbilden (font-size 6pt, margin-top 1.2mm)
  const higherEl = doc.createElement('div');
  higherEl.style.cssText = 'margin-top:1.2mm;font-size:6pt;line-height:1.3;white-space:pre-wrap;';
  higherEl.textContent = 'Auf höheren Graden. ' + higherLevels;
  el.appendChild(higherEl);

  doc.body.appendChild(el);
  const fits = el.scrollHeight <= el.clientHeight + 2;
  doc.body.removeChild(el);
  return fits;
}

/**
 * Druckt mehrere Zauber als eine Seite (9 Karten/A4, wie bei Einzelzauber).
 * Lädt für jeden Zauber die Chunks und packt sie in gemeinsame Seiten.
 */
export function prepareMultiSpellPrint(spells: Spell[], doc: Document): string {
  const allCards: string[] = [];

  for (const spell of spells) {
    const { firstH, contH } = measureDescHeights(spell, doc);
    const chunks = splitDescription(spellDesc(spell), firstH, contH, doc);

    const higherLvl = spellHigherLevel(spell);
    if (higherLvl) {
      const lastIdx = chunks.length - 1;
      const lastCardH = lastIdx === 0 ? firstH : contH;
      if (!higherLevelsFits(chunks[lastIdx], higherLvl, lastCardH, doc)) {
        chunks.push('');
      }
    }

    chunks.forEach((chunk, i) => {
      const isLast = i === chunks.length - 1;
      allCards.push(
        i === 0
          ? renderFirstCard(spell, chunk, isLast)
          : renderContCard(spell, chunk, i + 1, isLast),
      );
    });
  }

  const pages: string[] = [];
  for (let i = 0; i < allCards.length; i += 9) {
    const batch = allCards.slice(i, i + 9);
    while (batch.length < 9) batch.push(renderEmptyCard());
    pages.push(`<div class="page">\n${batch.join('\n')}\n</div>`);
  }

  const title = spells[0] ? `${esc(spells[0].name)} u.a. – Zauberkarten` : 'Zauberkarten';
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

/**
 * Misst per DOM den tatsächlichen Textüberlauf, teilt den Beschreibungstext
 * auf und gibt fertiges Druck-HTML zurück.
 * Muss im Browser-Kontext aufgerufen werden (benötigt `document`).
 */
export function prepareSpellPrint(spell: Spell, doc: Document): string {
  const { firstH, contH } = measureDescHeights(spell, doc);
  const chunks = splitDescription(spellDesc(spell), firstH, contH, doc);

  const higherLvl = spellHigherLevel(spell);
  if (higherLvl) {
    const lastIdx = chunks.length - 1;
    const lastCardH = lastIdx === 0 ? firstH : contH;
    if (!higherLevelsFits(chunks[lastIdx], higherLvl, lastCardH, doc)) {
      chunks.push('');
    }
  }

  return buildSpellPrintHtml(spell, chunks);
}
