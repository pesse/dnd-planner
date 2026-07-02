#!/usr/bin/env node
/**
 * Zerlegt die deutsche Regel-Prosa des SRD-PDF in überschriften-basierte Chunks
 * → src/lib/data/rules-chunks.json (Stufe 2, Volltextsuche).
 *
 * Überschriften sind rot (#8c2220) GillSans-SemiBold in drei Größen:
 *   27 = H1 (Sektion, z.B. „Kampf"), 21 = H2, 18 = H3. Body ist Cambria schwarz,
 *   Fußzeile grau (#808285, wird übersprungen). Reihenfolge: Seite → Spalte l/r.
 *
 * Scope: DE-Prosa (Regeln/Charaktererstellung/Klassen). Zauber/Monster/magische
 * Gegenstände liegen außerhalb des Seitenbereichs und sind damit ausgeschlossen.
 * Das Regelglossar (Stufe 1) wird NICHT mitindiziert (Vermeidung von Duplikaten).
 *
 * Aufruf:  node scripts/srd/extract-chunks.mjs "<DE-PDF>" 5 121
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [, , PDF, FROM = '5', TO = '121'] = process.argv;
if (!PDF) {
  console.error('Usage: node scripts/srd/extract-chunks.mjs "<pdf>" [fromPage] [toPage]');
  process.exit(1);
}
const HEAD_COLOR = '#8c2220';
const MAX_LEN = 1400; // lange Sektionen an Satzgrenzen splitten
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/lib/data/rules-chunks.json');

const xml = execFileSync('pdftohtml', ['-xml', '-f', FROM, '-l', TO, '-i', '-stdout', PDF], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#160;/g, ' ').replace(/&#8217;/g, '’').replace(/&#8211;/g, '–')
    .replace(/&#8222;/g, '„').replace(/&#8220;/g, '“').replace(/&#8221;/g, '“')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();

const SKIP = /^(Systemreferenz.*|\d+)$/i;

// Fontspecs global: Überschriften-Level nach Größe; graue Fußzeilen-Fonts skippen.
const headLevel = new Map(); // fontId → 1|2|3
const grayFonts = new Set();
for (const fm of xml.matchAll(/<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"\/>/g)) {
  const [, id, size, family, color] = fm;
  const c = color.toLowerCase();
  if (c === HEAD_COLOR && /SemiBold|Bold/i.test(family)) {
    const s = +size;
    if (s >= 25) headLevel.set(id, 1);
    else if (s >= 20) headLevel.set(id, 2);
    else if (s >= 17) headLevel.set(id, 3);
  }
  if (c === '#808285') grayFonts.add(id); // Kopf-/Fußzeile
}

// Fragmente in globaler Lesereihenfolge sammeln.
const frags = [];
for (const pm of xml.matchAll(/<page number="(\d+)"[^>]*width="(\d+)"[^>]*>([\s\S]*?)<\/page>/g)) {
  const page = +pm[1];
  const mid = +pm[2] / 2;
  const pf = [];
  for (const tm of pm[3].matchAll(/<text top="(\d+)" left="(\d+)"[^>]*font="(\d+)">([\s\S]*?)<\/text>/g)) {
    const [, top, left, font, raw] = tm;
    if (grayFonts.has(font)) continue;
    const text = decode(raw);
    if (!text || SKIP.test(text)) continue;
    pf.push({ top: +top, col: +left < mid ? 0 : 1, level: headLevel.get(font) ?? 0, text });
  }
  for (const col of [0, 1]) {
    for (const f of pf.filter((x) => x.col === col).sort((a, b) => a.top - b.top)) frags.push({ ...f, page });
  }
}

function dehyphenate(text) {
  return text
    .replace(/­\s*/g, '')
    .replace(/([A-Za-zÄÖÜäöüß])[‐‑-]\s+([a-zäöüß])/g, '$1$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// State-Machine: Überschriften-Hierarchie verfolgen, Body je Überschrift sammeln.
const raw = [];
let section = ''; // aktuelle H1
let cur = null; // { section, heading, page, parts, headOpen }
const flush = () => {
  if (cur && cur.parts.length) raw.push(cur);
  cur = null;
};
for (const f of frags) {
  if (f.level > 0) {
    if (cur && cur.headOpen) {
      cur.heading += ' ' + f.text; // mehrzeilige Überschrift
    } else {
      flush();
      if (f.level === 1) section = f.text;
      cur = { section: f.level === 1 ? f.text : section, heading: f.text, page: f.page, parts: [], headOpen: true };
    }
  } else {
    if (cur) { cur.headOpen = false; cur.parts.push(f.text); }
  }
}
flush();

// Lange Chunks an Satzgrenzen splitten.
const slug = (s) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
function splitText(text) {
  if (text.length <= MAX_LEN) return [text];
  const out = [];
  const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) ?? [text];
  let buf = '';
  for (const s of sentences) {
    if (buf.length + s.length > MAX_LEN && buf) { out.push(buf.trim()); buf = ''; }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const chunks = [];
for (const c of raw) {
  const text = dehyphenate(c.parts.join(' '));
  if (text.length < 40) continue; // triviale Fragmente (Bildunterschriften o.ä.) raus
  const pieces = splitText(text);
  pieces.forEach((piece, i) => {
    const base = `${slug(c.section)}-${slug(c.heading)}-p${c.page}`;
    chunks.push({
      id: pieces.length > 1 ? `${base}-${i + 1}` : base,
      section: c.section,
      heading: c.heading,
      page: c.page,
      text: piece,
    });
  });
}

// Diagnose
const sections = [...new Set(chunks.map((c) => c.section))];
console.error(`Rohe Überschriften-Blöcke: ${raw.length} → Chunks: ${chunks.length}`);
console.error(`Sektionen (${sections.length}): ${sections.join(' · ')}`);
console.error(`Ø Länge: ${Math.round(chunks.reduce((a, c) => a + c.text.length, 0) / chunks.length)} Zeichen`);

writeFileSync(OUT, JSON.stringify(chunks, null, 2) + '\n');
console.error(`→ ${OUT}`);
