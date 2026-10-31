#!/usr/bin/env node
/**
 * Schreibt die Regelglossare beider SRD-PDFs als Regelbibliothek nach `vault/rules/`
 * (ein Eintrag je Begriff, `desc` englisch, `descDe` deutsch, als Markdown).
 *
 * Stichworte sind GillSans-SemiBold in D&D-Rot, Größe 17–20; der Text dazwischen ist Cambria.
 * Ein neuer Absatz beginnt im englischen PDF mit Leerzeichen, im deutschen eingerückt.
 * Welche Stichworte Regelbegriffe sind und welches englische zu welchem deutschen gehört,
 * entscheidet `src/lib/data/glossary.json` — die Anhang-Kataloge (Flüche, Gifte …) fallen so weg.
 *
 * Aufruf:  node scripts/srd/extract-rules.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'vault/rules');
const DRY = process.argv.includes('--dry-run');

const BOOKS = {
  en: { pdf: 'docs/srd/SRD_CC_v5.2.1.pdf', from: 176, to: 193, head: '#88191f', gray: '#7b7879' },
  de: { pdf: 'docs/srd/DE_SRD_CC_v5.2.1.pdf', from: 203, to: 225, head: '#8c2220', gray: '#808285' },
};

const CATEGORY_TAGS = {
  Condition: 'condition', Zustand: 'condition',
  Action: 'action', Aktion: 'action',
  'Area of Effect': 'area_of_effect', Wirkungsbereich: 'area_of_effect',
  Hazard: 'hazard', Gefahr: 'hazard',
  Attitude: 'attitude', Einstellung: 'attitude',
};

const SKIP = /^(Rules Glossary|Regelglossar|Glossary Conventions|Glossar-Konventionen|System Reference Document.*|Systemreferenzdokument.*)$/i;

/** Inline-Formatierung wird Markdown; die fett-kursiven Unterüberschriften wie im Vault nur fett. */
function decode(raw) {
  return raw
    .replace(/<i><b>([\s\S]*?)<\/b><\/i>/g, '<b>$1</b>')
    .replace(/<b>(\s*)([\s\S]*?)(\s*)<\/b>/g, (_, a, t, b) => (t ? `${a}**${t}**${b}` : a + b))
    .replace(/<i>(\s*)([\s\S]*?)(\s*)<\/i>/g, (_, a, t, b) => (t ? `${a}*${t}*${b}` : a + b))
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#160;/g, ' ').replace(/&quot;/g, '"');
}

function fontClasses(xml, book) {
  const cls = new Map();
  for (const [, id, size, family, color] of xml.matchAll(
    /<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"\/>/g,
  )) {
    const c = color.toLowerCase();
    const semi = /SemiBold|Bold/i.test(family);
    if (c === book.gray) cls.set(id, 'skip');
    // Größer als ein Stichwort = Kapitelüberschrift: dahinter beginnt der Anhang.
    else if (c === book.head) cls.set(id, !semi ? 'skip' : +size > 20 ? 'chapter' : +size >= 17 ? 'head' : 'skip');
    else if (/Cambria/i.test(family)) cls.set(id, 'body');
    else if (semi && +size >= 16) cls.set(id, 'tableTitle');
    else cls.set(id, 'cell');
  }
  return cls;
}

/** Fragmente in Lesereihenfolge: Seite → linke, dann rechte Spalte. */
function fragments(book) {
  const xml = execFileSync('pdftohtml', ['-xml', '-f', book.from, '-l', book.to, '-i', '-stdout', join(ROOT, book.pdf)], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const cls = fontClasses(xml, book);
  const out = [];
  for (const [, page, width, body] of xml.matchAll(/<page number="(\d+)"[^>]*width="(\d+)"[^>]*>([\s\S]*?)<\/page>/g)) {
    const mid = +width / 2;
    const frags = [];
    for (const [, top, left, width, font, raw] of body.matchAll(/<text top="(\d+)" left="(\d+)" width="(\d+)"[^>]*font="(\d+)">([\s\S]*?)<\/text>/g)) {
      const kind = cls.get(font) ?? 'cell';
      const text = decode(raw);
      if (kind === 'skip' || !text.trim() || SKIP.test(text.trim())) continue;
      frags.push({ page: +page, top: +top, left: +left, width: +width, col: +left < mid ? 0 : 1, kind, text });
    }
    for (const col of [0, 1]) {
      const inCol = frags.filter((f) => f.col === col).sort((a, b) => a.top - b.top || a.left - b.left);
      const body = inCol.filter((f) => f.kind === 'body');
      const base = Math.min(...(body.length ? body : inCol).map((f) => f.left));
      // `rel` ist die Lage in der Spalte: eine Tabelle kann über beide Spalten laufen.
      for (const f of inCol) out.push({ ...f, rel: f.left - base, indent: f.left > base + 6 });
    }
  }
  return out;
}

/** Zeilenumbruch-Trennungen auflösen: „typ-" + „ically", „Bewegungs‑" + „rate". */
function joinLines(lines) {
  let text = '';
  for (const line of lines) {
    const l = line.trim();
    if (!text) text = l;
    else if (/[A-Za-zÄÖÜäöüß][-‑\u00AD]$/.test(text) && /^[a-zäöüß]/.test(l)) text = text.slice(0, -1) + l;
    else text += ' ' + l;
  }
  // Ein weiches Trennzeichen am Ende bleibt: die Tabelle hängt die Folgezeile der Zelle erst später an.
  return text.replace(/‑/g, '-').replace(/­(?!$)/g, '').replace(/\s{2,}/g, ' ').replace(/\*\*\s*\*\*/g, ' ');
}

const plain = (c) => c.text.replace(/\*\*/g, '').trim();

/** Linke Kanten, die näher als 12 pt beieinander liegen, sind eine Spalte. */
function columnStarts(cells) {
  const starts = [];
  for (const x of cells.map((c) => c.left).sort((a, b) => a - b)) {
    if (!starts.length || x - starts[starts.length - 1] > 12) starts.push(x);
  }
  return starts;
}

/**
 * Ein Fragment über mehrere Spalten („AC Substance", „11 Cloth, paper, rope") wird an
 * Wortgrenzen aufgeteilt: je ein Wort in die vorderen Spalten, der Rest in die letzte.
 */
function spread(cell, starts) {
  const covered = starts.filter((x) => x >= cell.left - 8 && x < cell.left + cell.width);
  const words = plain(cell).split(/\s+/);
  if (covered.length < 2 || words.length < covered.length) return [{ x: covered[0] ?? cell.left, text: plain(cell) }];
  return covered.map((x, i) => ({
    x,
    text: i < covered.length - 1 ? words[i] : words.slice(i).join(' '),
  }));
}

function renderTable(title, frags) {
  // Zeilen in Lesereihenfolge; zusammen gehört, was in derselben Spalte auf einer Höhe steht.
  const rows = [];
  for (const f of frags) {
    const c = { ...f, left: f.rel };
    const row = rows.find((r) => r.page === c.page && r.col === c.col && Math.abs(r.top - c.top) <= 3);
    if (row) row.cells.push(c);
    else rows.push({ page: c.page, col: c.col, top: c.top, cells: [c] });
  }
  const lines = title ? [`**${title.replace(/\*\*/g, '').trim()}**`, ''] : [];
  const isHead = (r) => r.cells.every((c) => c.text.includes('**'));
  const headRows = [];
  while (rows.length && isHead(rows[0])) headRows.push(rows.shift());

  if (!headRows.length) {
    // Ohne Kopfzeile ist es eine Aufzählung im Raster, gelesen Spalte für Spalte.
    const all = rows.flatMap((r) => r.cells).sort((a, b) => a.left - b.left || a.top - b.top);
    return [...lines, all.map(plain).join(', ')].join('\n');
  }

  // Die Spalten geben die Daten vor — außer der Kopf hat weniger, dann zerfallen die Zellen
  // nur in Fragmente („Stä. ×" | „3,75 kg") und der Kopf ordnet sie.
  const dataStarts = columnStarts(rows.flatMap((r) => r.cells));
  const headParts = headRows.flatMap((r) => r.cells).flatMap((c) => spread(c, dataStarts));
  const headStarts = columnStarts(headParts.map((p) => ({ left: p.x })));
  const starts = headStarts.length < dataStarts.length ? headStarts : dataStarts;
  const at = (x) => starts.reduce((best, s, i) => (x + 8 >= s ? i : best), 0);
  const grid = (cs) => {
    const out = starts.map(() => []);
    for (const c of cs) for (const part of spread(c, starts)) out[at(part.x)].push(part.text);
    return out.map((o) => joinLines(o));
  };

  const head = grid(headRows.flatMap((r) => r.cells));
  // Folgt eine Zeile dichter als der Zeilenabstand der Tabelle (~22 pt), ist sie der Umbruch
  // mehrzeiliger Zellen der vorigen. Ein wiederholter Kopf (Spaltenwechsel) fällt weg.
  const body = [];
  rows.forEach((r, i) => {
    const cellsOf = grid(r.cells);
    if (cellsOf.join('|') === head.join('|')) return;
    const prev = body[body.length - 1];
    const above = rows[i - 1];
    if (prev && above && above.page === r.page && above.col === r.col && r.top - above.top < 21) {
      cellsOf.forEach((t, j) => { if (t) prev[j] = joinLines([prev[j], t].filter(Boolean)); });
    } else body.push(cellsOf);
  });

  // Zwei gleiche Kopfhälften nebeneinander = eine umgebrochene Tabelle; untereinander stapeln.
  const half = head.length / 2;
  const split = Number.isInteger(half) && head.slice(0, half).join('|') === head.slice(half).join('|');
  const width = split ? half : head.length;
  const table = [head.slice(0, width)];
  for (const r of body) table.push(r.slice(0, width));
  if (split) for (const r of body) if (r.slice(half).some(Boolean)) table.push(r.slice(half));

  lines.push(...table.map((r, i) => `| ${r.map((t) => t.replace(/\u00AD$/, '')).join(' | ')} |` + (i === 0 ? `\n|${r.map(() => '---').join('|')}|` : '')));
  return lines.join('\n');
}

/** Ein Eintrag als Markdown-Blöcke: Absätze, Aufzählungen, Tabellen. */
function render(frags) {
  const blocks = [];
  let para = null;
  let table = null;
  const flushTable = () => {
    if (table) blocks.push(renderTable(table.title, table.cells));
    table = null;
  };
  for (const f of frags) {
    if (f.kind === 'body') {
      flushTable();
      const starts = !para || para.bullet || /^\s/.test(f.text) || f.indent;
      if (starts) blocks.push((para = { lines: [f.text], bullet: false }));
      else para.lines.push(f.text);
    } else if (f.kind === 'cell' && /^\s*•/.test(f.text)) {
      flushTable();
      blocks.push((para = { lines: [f.text.replace(/^\s*•\s*/, '')], bullet: true }));
    } else if (f.kind === 'cell' && para?.bullet && !table) {
      para.lines.push(f.text);
    } else if (f.kind === 'tableTitle') {
      flushTable();
      para = null;
      table = { title: f.text, cells: [] };
    } else {
      para = null;
      (table ??= { title: '', cells: [] }).cells.push(f);
    }
  }
  flushTable();

  const md = [];
  for (const b of blocks) {
    if (typeof b === 'string') md.push(b);
    else if (b.bullet && md.length && md[md.length - 1].startsWith('- ')) md[md.length - 1] += '\n- ' + joinLines(b.lines);
    else md.push((b.bullet ? '- ' : '') + joinLines(b.lines));
  }
  return md.join('\n\n').trim();
}

function entries(book) {
  const out = [];
  let cur = null;
  for (const f of fragments(book)) {
    if (f.kind === 'head') {
      const text = f.text.replace(/\*\*/g, '').trim();
      if (cur && !cur.frags.length) cur.head += ' ' + text; // mehrzeiliges Stichwort
      else out.push((cur = { head: text, frags: [] }));
    } else if (f.kind === 'chapter') cur = null;
    else if (cur) cur.frags.push(f);
  }
  return out.map((e) => {
    const m = e.head.match(/^(.*?)\s*[[(]([^\])]+)[\])]\s*$/);
    return { name: (m ? m[1] : e.head).trim(), category: CATEGORY_TAGS[m?.[2]?.trim()] ?? 'rule', md: render(e.frags) };
  });
}

const norm = (s) => s.toLowerCase().replace(/[‑-]/g, '-').replace(/\s+/g, ' ').replace(/\s*[[(][^\])]*[\])]\s*$/, '').trim();
const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const terms = JSON.parse(readFileSync(join(ROOT, 'src/lib/data/glossary.json'), 'utf8')).terms;
const en = new Map(entries(BOOKS.en).map((e) => [norm(e.name), e]));
const de = new Map(entries(BOOKS.de).map((e) => [norm(e.name), e]));

const rules = [];
const missing = [];
for (const t of terms) {
  const e = en.get(norm(t.en));
  const d = de.get(norm(t.de));
  if (!e || !d) {
    missing.push(`${t.en}${e ? '' : ' (EN fehlt)'} / ${t.de}${d ? '' : ' (DE fehlt)'}`);
    continue;
  }
  // Den Einstellungen fehlt im deutschen PDF die Marke; nur ein Widerspruch zählt.
  if (d.category !== 'rule' && e.category !== d.category) missing.push(`${t.en}: Kategorie EN ${e.category} ≠ DE ${d.category}`);
  rules.push({
    key: `srd-2024_${slug(t.en)}`,
    source: 'srd-2024',
    name: e.name,
    nameDe: d.name,
    category: e.category,
    desc: e.md,
    descDe: d.md,
  });
}

console.error(`Stichworte EN ${en.size}, DE ${de.size} → ${rules.length}/${terms.length} Regelbegriffe`);
for (const m of missing) console.error(`  FEHLT/ABWEICHUNG: ${m}`);
const empty = rules.filter((r) => !r.desc || !r.descDe);
if (empty.length) console.error(`  LEER: ${empty.map((r) => r.name).join(', ')}`);

if (!DRY) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const r of rules) writeFileSync(join(OUT_DIR, `${slug(r.name)}.json`), JSON.stringify(r, null, 2) + '\n');
  console.error(`→ ${OUT_DIR}`);
}
