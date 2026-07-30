#!/usr/bin/env node
/**
 * Extrahiert das deutsche Regelglossar (Stichwort + Definition) aus dem SRD-PDF
 * → src/lib/data/rules-glossary.json (Stufe 1 des Regel-Nachschlagewerks).
 *
 * Headwords haben eine eigene Schrift (GillSans-SemiBold, D&D-Rot, Größe 17–20).
 * Der Fließtext dazwischen (Cambria) ist die Definition. Fontspec-IDs sind global
 * kumulativ. Zweispalten-Layout wird per x-Koordinate getrennt; Einträge fließen
 * über Spalten-/Seitengrenzen (ein laufender Cursor, kein Reset).
 *
 * A–Z-Schnitt + en/cat-Anreicherung passieren durch JOIN mit dem autoritativen
 * glossary.json (155 Regelterme): nur Headwords, die dort vorkommen, werden
 * Einträge — Anhang-Kataloge (Flüche/Krankheiten/Gifte/Gefahren) fallen so weg.
 *
 * Aufruf:  node scripts/srd/extract-glossary.mjs "<DE-PDF>" 203 225 [#8c2220]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [, , PDF, FROM = '203', TO = '225', COLOR = '#8c2220'] = process.argv;
if (!PDF) {
  console.error('Usage: node extract-glossary.mjs "<pdf>" [fromPage] [toPage] [#color]');
  process.exit(1);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GLOSSARY = JSON.parse(readFileSync(join(ROOT, 'src/lib/data/glossary.json'), 'utf8'));
const OUT = join(ROOT, 'src/lib/data/rules-glossary.json');

// ── Term-Map aus dem autoritativen Glossar (normalisiertes de → {en,cat,de}) ──
const stripTag = (s) => s.replace(/\s*\([^)]*\)\s*$/, '').trim(); // „Blind (Zustand)" → „Blind"
const norm = (s) => stripTag(s).toLowerCase().replace(/\s+/g, ' ').trim();
const termMap = new Map();
for (const t of GLOSSARY.terms) termMap.set(norm(t.de), { en: t.en, cat: t.cat, de: t.de });

// ── pdftohtml -xml ────────────────────────────────────────────────────────────
const xml = execFileSync('pdftohtml', ['-xml', '-f', FROM, '-l', TO, '-i', '-stdout', PDF], {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
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

const SKIP = /^(Regelglossar|Glossar-Konventionen|Systemreferenz.*|\d+)$/i;

// Headword-Fonts: Rotfarbe + SemiBold, Größe 17–20 (Titel 27/39 raus).
const hwFonts = new Set();
for (const fm of xml.matchAll(/<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"\/>/g)) {
  const [, id, size, family, color] = fm;
  if (color.toLowerCase() === COLOR.toLowerCase() && /SemiBold|Bold/i.test(family) && +size >= 17 && +size <= 20) {
    hwFonts.add(id);
  }
}

// ── Fragmente in globaler Lesereihenfolge (Seite → Spalte links, dann rechts) ──
const frags = [];
for (const pm of xml.matchAll(/<page number="(\d+)"[^>]*width="(\d+)"[^>]*>([\s\S]*?)<\/page>/g)) {
  const page = +pm[1];
  const mid = +pm[2] / 2;
  const pageFrags = [];
  for (const tm of pm[3].matchAll(/<text top="(\d+)" left="(\d+)"[^>]*font="(\d+)">([\s\S]*?)<\/text>/g)) {
    const [, top, left, font, raw] = tm;
    const text = decode(raw);
    if (!text) continue;
    pageFrags.push({ top: +top, col: +left < mid ? 0 : 1, isHead: hwFonts.has(font), text });
  }
  for (const col of [0, 1]) {
    for (const f of pageFrags.filter((x) => x.col === col).sort((a, b) => a.top - b.top)) {
      frags.push({ ...f, page });
    }
  }
}

// ── State-Machine: Headword-Zeilen sammeln, Body dazwischen = Definition ───────
const entries = [];
let cur = null;
for (const f of frags) {
  if (f.isHead) {
    if (cur && cur.body.length === 0) cur.head += ' ' + f.text; // mehrzeiliges Stichwort
    else { cur = { head: f.text, body: [], page: f.page }; entries.push(cur); }
  } else {
    if (SKIP.test(f.text)) continue; // Fußzeile / Seitenzahl
    if (cur) cur.body.push(f.text);
  }
}

// ── Definition säubern + „Siehe auch" abtrennen ────────────────────────────────
function dehyphenate(text) {
  return text
    .replace(/­\s*/g, '')                                   // weiches Trennzeichen
    .replace(/([A-Za-zÄÖÜäöüß])[‐‑-]\s+([a-zäöüß])/g, '$1$2')     // Trennung am Zeilenende
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function splitSeeAlso(def) {
  const idx = def.search(/Siehe auch/i);
  if (idx < 0) return { definition: def.trim(), seeAlso: [] };
  const tail = def.slice(idx);
  const seeAlso = [...tail.matchAll(/[„“"]([^„“"]+)[„“"]/g)].map((m) => m[1].trim());
  return { definition: def.slice(0, idx).trim(), seeAlso };
}

// ── Join mit Glossar → nur Regelterme behalten ─────────────────────────────────
const out = [];
const seen = new Set();
let unmatched = 0;
for (const e of entries) {
  const key = norm(e.head);
  const term = termMap.get(key);
  if (!term) { unmatched++; continue; }
  if (seen.has(key)) continue;
  seen.add(key);
  const { definition, seeAlso } = splitSeeAlso(dehyphenate(e.body.join(' ')));
  out.push({ de: term.de, en: term.en, cat: term.cat, page: e.page, definition, seeAlso });
}

// ── Diagnose ───────────────────────────────────────────────────────────────────
const missing = [...termMap.values()].filter((t) => !seen.has(norm(t.de)));
const empty = out.filter((o) => !o.definition);
console.error(`Extrahierte Headwords: ${entries.length} | verworfen (kein Regelterm): ${unmatched}`);
console.error(`Gematchte Einträge: ${out.length}/${termMap.size}`);
if (missing.length) console.error(`FEHLEND (${missing.length}): ${missing.map((t) => t.de).join(', ')}`);
if (empty.length) console.error(`LEERE Definition (${empty.length}): ${empty.map((o) => o.de).join(', ')}`);

out.sort((a, b) => a.de.localeCompare(b.de, 'de'));
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.error(`→ ${OUT} (${out.length} Einträge)`);
