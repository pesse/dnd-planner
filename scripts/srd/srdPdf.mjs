/** PDF-Text der SRD-Bücher als Fragmente in Lesereihenfolge und deren Markdown-Wiedergabe. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

function fontClasses(xml, book, headKind) {
  const cls = new Map();
  for (const [, id, size, family, color] of xml.matchAll(
    /<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"\/>/g,
  )) {
    const c = color.toLowerCase();
    const semi = /SemiBold|Bold/i.test(family);
    if (c === book.gray) cls.set(id, 'skip');
    else if (c === book.head) cls.set(id, semi ? headKind(+size) : 'skip');
    else if (/Cambria/i.test(family)) cls.set(id, 'body');
    else if (semi && +size >= 16) cls.set(id, 'tableTitle');
    // Kapitälchen-Titel eines Randkastens: Großbuchstaben 17, Kleinbuchstaben 12.
    else if (!semi && (+size === 17 || +size === 12)) cls.set(id, 'smallCaps');
    else cls.set(id, +size === 14 ? 'cell14' : 'cell');
  }
  return cls;
}

/**
 * Ein Randkasten ist ein fetter Kapitälchen-Titel mit GillSans-14-Zeilen an derselben linken
 * Kante darunter. Die Kleinbuchstaben stehen im PDF teils groß („EvEl") und werden klein.
 */
function markAsides(frags) {
  const titles = frags.filter((f) => f.kind === 'smallCaps' && f.bold);
  const used = new Set();
  for (const t of titles) {
    if (used.has(t)) continue;
    // Ein zweizeiliger Titel („Kreaturen in den Zustand Bewusstlos / versetzen") steht direkt darunter.
    const group = titles
      .filter((o) => o.col === t.col && o.top >= t.top - 8 && o.top <= t.top + 28)
      .sort((a, b) => (Math.abs(a.top - b.top) > 8 ? a.top - b.top : a.left - b.left));
    group.forEach((g) => used.add(g));
    let text = '';
    let prev = null;
    for (const g of group) {
      const raw = g.text.replace(/\*\*/g, '');
      const piece = g.size === 12 ? raw.toLowerCase() : raw.toUpperCase();
      const gap = prev && (Math.abs(g.top - prev.top) > 8 || g.left - (prev.left + prev.width) >= 3 || /\s$/.test(prev.raw) || /^\s/.test(raw));
      text += (gap ? ' ' : '') + piece.trim();
      prev = { ...g, raw };
    }
    const left = group[0].left;
    const top = Math.max(...group.map((g) => g.top));
    Object.assign(group[0], { kind: 'asideTitle', text: text.replace(/\s+/g, ' ').trim() });
    group.slice(1).forEach((g) => (g.kind = 'skip'));
    let last = top;
    for (const f of frags.filter((o) => o.col === t.col && o.top > top && (o.kind === 'cell14' || (o.kind === 'cell' && o.size === 14))).sort((a, b) => a.top - b.top || a.left - b.left)) {
      if (f.top - last > 30) break;
      if (f.left >= left - 12) Object.assign(f, { kind: 'aside' });
      last = f.top;
    }
  }
  for (const f of frags) if (f.kind === 'cell14' || f.kind === 'smallCaps') f.kind = 'cell';
  return frags.filter((f) => f.kind !== 'skip');
}

/**
 * Tabellenzellen der rechten Spalte auf Höhe einer Zelle der linken gehören zu einer Tabelle über
 * beide Spalten — außer die rechte Spalte hat seit dem Titel der linken einen eigenen Tabellentitel.
 */
function joinWideTables(frags) {
  const left = frags.filter((f) => f.col === 0 && f.kind === 'cell');
  const titles = (col) => frags.filter((f) => f.col === col && f.kind === 'tableTitle');
  for (const f of frags) {
    if (f.col !== 1 || f.kind !== 'cell') continue;
    const twin = left.find((l) => Math.abs(l.top - f.top) <= 3);
    if (!twin) continue;
    const since = Math.max(-1, ...titles(0).filter((t) => t.top < twin.top).map((t) => t.top));
    if (!titles(1).some((t) => t.top >= since - 10 && t.top < f.top)) f.col = 0;
  }
  return frags;
}

/**
 * Fragmente in Lesereihenfolge: Seite → linke, dann rechte Spalte. `headKind` ordnet einer
 * Überschriftgröße in Kapitelrot ihre Art zu (`'skip'` verwirft sie).
 */
export function fragments(book, headKind, from = book.from, to = book.to) {
  const xml = execFileSync('pdftohtml', ['-xml', '-f', from, '-l', to, '-i', '-stdout', join(ROOT, book.pdf)], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const cls = fontClasses(xml, book, headKind);
  const sizes = new Map([...xml.matchAll(/<fontspec id="(\d+)" size="(\d+)"/g)].map(([, id, size]) => [id, +size]));
  const out = [];
  for (const [, page, width, body] of xml.matchAll(/<page number="(\d+)"[^>]*width="(\d+)"[^>]*>([\s\S]*?)<\/page>/g)) {
    const mid = +width / 2;
    const frags = [];
    for (const [, top, left, width, font, raw] of body.matchAll(/<text top="(\d+)" left="(\d+)" width="(\d+)"[^>]*font="(\d+)">([\s\S]*?)<\/text>/g)) {
      const kind = cls.get(font) ?? 'cell';
      const text = decode(raw);
      if (kind === 'skip' || !text.trim() || SKIP.test(text.trim())) continue;
      frags.push({ page: +page, top: +top, left: +left, width: +width, col: +left < mid ? 0 : 1, kind, text, size: sizes.get(font), bold: /<b>/.test(raw) });
    }
    const placed = joinWideTables(markAsides(frags));
    for (const col of [0, 1]) {
      const inCol = placed.filter((f) => f.col === col).sort((a, b) => a.top - b.top || a.left - b.left);
      const body = inCol.filter((f) => f.kind === 'body');
      const base = Math.min(...(body.length ? body : inCol).map((f) => f.left));
      // `rel` ist die Lage in der Spalte: eine Tabelle kann über beide Spalten laufen.
      for (const f of inCol) out.push({ ...f, rel: f.left - base, indent: f.left > base + 6 });
    }
  }
  return out;
}

/** Zeilenumbruch-Trennungen auflösen: „typ-" + „ically", „Bewegungs‑" + „rate". */
export function joinLines(lines) {
  let text = '';
  for (const line of lines) {
    const l = line.trim();
    if (!text) text = l;
    else if (/[A-Za-zÄÖÜäöüß][-‑\u00AD]$/.test(text) && /^[a-zäöüß]/.test(l)) text = text.slice(0, -1) + l;
    else text += ' ' + l;
  }
  // Ein weiches Trennzeichen am Ende bleibt: die Tabelle hängt die Folgezeile der Zelle erst später an.
  return text
    .replace(/([a-zäöüß])[-‑]\* \*([a-zäöüß])/g, '$1$2') // „*Light-* *ning*“
    .replace(/([^\s*])\* \*([^\s*])/g, '$1 $2') // „*Kugel der* *Drachen*“
    .replace(/‑/g, '-').replace(/­(?!$)/g, '').replace(/\s{2,}/g, ' ').replace(/\*\*\s*\*\*/g, ' ');
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
export function render(frags) {
  const blocks = [];
  let para = null;
  let table = null;
  const flushTable = () => {
    if (table) blocks.push(renderTable(table.title, table.cells));
    table = null;
  };
  for (const f of frags) {
    if (f.kind === 'asideTitle') {
      flushTable();
      blocks.push((para = { lines: [`**${f.text}.**`], bullet: false, aside: true }));
    } else if (f.kind === 'aside') {
      flushTable();
      if (para?.aside && !/^\s/.test(f.text)) para.lines.push(f.text);
      else blocks.push((para = { lines: [f.text], bullet: false, aside: true }));
    } else if (f.kind === 'body') {
      flushTable();
      // Eingerückt ist im deutschen PDF ein Absatzanfang, in Aufzählungen aber die Folgezeile
      // (hängender Einzug) — die setzt fort, solange die Zeile davor keinen Satz beendet.
      const prev = para && !para.bullet && !para.aside ? para.lines[para.lines.length - 1] : null;
      const cont = prev !== null && f.indent && !/^\s/.test(f.text) && !/[.:!?]\W*$/.test(prev) && !/^\s*\*\*\d+[.:]/.test(f.text);
      const item = prev !== null && !f.indent && /^\*\*/.test(f.text) && /[.:!?]\W*$/.test(prev);
      const starts = !cont && (!para || para.bullet || para.aside || /^\s/.test(f.text) || f.indent || item);
      if (starts) blocks.push((para = { lines: [f.text], bullet: false }));
      else para.lines.push(f.text);
    } else if (f.kind === 'cell' && /^\s*•/.test(f.text)) {
      flushTable();
      blocks.push((para = { lines: [f.text.replace(/^\s*•\s*/, '')], bullet: true }));
    } else if (f.kind === 'cell' && para?.bullet && !table) {
      para.lines.push(f.text);
    } else if (f.kind === 'tableTitle' && table?.title && !table.cells.length) {
      table.title = joinLines([table.title.replace(/\*\*/g, ''), f.text.replace(/\*\*/g, '')]); // zweizeiliger Titel
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
