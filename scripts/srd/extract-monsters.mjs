#!/usr/bin/env node
/**
 * Zieht die deutschen Monster-Statblöcke aus dem deutschen SRD-PDF (Anhang „Monster von A–Z")
 * → scripts/srd/monsters-de.json. Gelesen wird die Datei von
 * `scripts/import-open5e-creatures.mts`, das damit `name`, `traits[]` und `actions[]` der
 * importierten Kreaturen auf Deutsch setzt.
 *
 * Das SRD 5.2.1 liegt offiziell auf Deutsch vor — eine KI-Übersetzung derselben Texte wäre
 * schlechter UND teurer.
 *
 * Erkannt wird alles über die Fontspecs des PDF, nicht über Textmuster:
 *   Größe 23 rot     = Name eines Statblocks (Größe 27 ist die A–Z-Überschrift darüber,
 *                      die bei Sammeleinträgen mehrere Blöcke zusammenfasst)
 *   Größe 18 rot     = Abschnitt im Block („Merkmale", „Aktionen", „Legendäre Aktionen", …)
 *   Optima #540000   = Kopfzeilen (RK/TP/HG …), Optima #636466 = Typzeile und Vorreden
 *   #540000 SC700    = Kapitälchen-Label der Attributstabelle, GillSans #540000 die Zahlen
 *                      darin — nach einem Label folgt immer erst der Attributswert, dann MOD/RW
 *   Optima #000000   = Fließtext; ein Eintrag beginnt mit einem <i><b>-Lauf (fett-kursiv),
 *                      während Hervorhebungen im Text nur <i> sind. Das ist die einzige
 *                      verlässliche Grenze zwischen zwei Merkmalen.
 *
 * Aufruf:  node scripts/srd/extract-monsters.mjs "docs/srd/DE_SRD_CC_v5.2.1.pdf" 300-412 251
 *
 * Seite 251 ist kein Tippfehler: die Riesenfliege steht als Wertekasten bei der Figurine
 * „Ebenholz-Fliege" und fehlt im Anhang. Ein Bereich außerhalb der Monsterseiten ist
 * unschädlich — ohne RK/TP/HG entsteht kein Datensatz.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [, , PDF = 'docs/srd/DE_SRD_CC_v5.2.1.pdf', ...RANGES] = process.argv;
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'monsters-de.json');

const pageRanges = (RANGES.length ? RANGES : ['300-412', '251']).map((r) => {
  const [from, to = from] = r.split('-');
  return [from, to];
});

/** Abschnittsüberschrift → Gruppe im internen Monster-Schema. */
const GROUPS = {
  merkmale: 'traits',
  aktionen: 'ACTION',
  bonusaktionen: 'BONUS_ACTION',
  reaktionen: 'REACTION',
  'legendäre aktionen': 'LEGENDARY_ACTION',
};

const xmlOf = ([from, to]) =>
  execFileSync('pdftohtml', ['-xml', '-f', from, '-l', to, '-i', '-stdout', PDF], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });

const entities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#160;/g, ' ')
    .replace(/&#173;/g, '­')
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8222;/g, '„')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '“')
    .replace(/&#8730;/g, '√')
    .replace(/&#8722;/g, '−')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const plain = (s) => entities(s.replace(/<[^>]+>/g, ''));

// Weiche Trennstriche und Zeilenumbruch-Trennungen zusammenziehen. Vor einer Konjunktion bleibt
// der Bindestrich stehen — dort trennt er nicht, sondern spart das Wort aus („Rückzug- oder
// Verstecken-Aktion"), und der Satz bricht dort ohnehin oft um.
const dehyphenate = (text) =>
  text
    .replace(/­\s*/g, '')
    .replace(/([A-Za-zÄÖÜäöüß])[‐‑-]\s+(?!(?:oder|und|bzw|sowie)\b)([a-zäöüß])/g, '$1$2')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Fontspec → Rolle. Die IDs gelten pro `pdftohtml`-Lauf und werden nur bei ihrem ersten
 * Vorkommen deklariert, deshalb je Seitenbereich neu aufgebaut.
 */
function rolesOf(xml) {
  const roleOf = new Map();
  const specs = /<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"\/>/g;
  for (const [, id, size, family, color] of xml.matchAll(specs)) {
    const s = +size;
    const c = color.toLowerCase();
    let role = '';
    if (c === '#8c2220' && /SemiBold/i.test(family)) role = s >= 25 ? 'entry' : s >= 21 ? 'statname' : '';
    else if (c === '#8c2220') role = s >= 17 && s <= 20 ? 'section' : '';
    else if (c === '#540000') role = /SC700/.test(family) ? 'abilitylabel' : /Optima/.test(family) ? 'header' : 'tablenum';
    else if (c === '#636466') role = 'aside';
    else if (c === '#000000') role = 'body';
    if (role) roleOf.set(id, role);
  }
  return roleOf;
}

/** Fragmente in Lesereihenfolge: Seite → Spalte → Zeile → links. */
function fragmentsOf(xml) {
  const roleOf = rolesOf(xml);
  const out = [];
  for (const pm of xml.matchAll(/<page number="(\d+)"[^>]*width="(\d+)"[^>]*>([\s\S]*?)<\/page>/g)) {
    const pageNo = +pm[1];
    const mid = +pm[2] / 2;
    const onPage = [];
    for (const tm of pm[3].matchAll(/<text top="(\d+)" left="(\d+)"[^>]*font="(\d+)">([\s\S]*?)<\/text>/g)) {
      const [, top, left, font, raw] = tm;
      const role = roleOf.get(font);
      if (!role) continue;
      onPage.push({ top: +top, left: +left, col: +left < mid ? 0 : 1, role, raw, page: pageNo });
    }
    // Zeilenweise von links nach rechts, nicht nur nach `top`: in der Attributstabelle sitzen
    // Kapitälchen-Label und Wert einer Zelle auf leicht verschiedenen Grundlinien (269 vs. 270),
    // und ein reiner top-Sort zerreißt damit die Zellen aller drei Spalten ineinander.
    const ROW_TOLERANCE = 8;
    for (const col of [0, 1]) {
      const inCol = onPage.filter((x) => x.col === col).sort((a, b) => a.top - b.top);
      let row = [];
      for (const f of inCol) {
        if (row.length && f.top > row[0].top + ROW_TOLERANCE) {
          out.push(...row.sort((a, b) => a.left - b.left));
          row = [];
        }
        row.push(f);
      }
      out.push(...row.sort((a, b) => a.left - b.left));
    }
  }
  return out;
}

// ── Statblöcke aufbauen ───────────────────────────────────────────────────────
const blocks = [];
let block = null;
let group = null;
/** Offener Eintrag, dessen Name noch über mehrere Fragmente läuft. */
let openName = false;
let scoreNext = false;

const currentList = () => (group ? (block.groups[group] ??= []) : null);

const lastEntry = () => {
  const list = currentList();
  return list && list.length ? list[list.length - 1] : null;
};

for (const range of pageRanges) {
  // Ein Statblock läuft über Seiten, aber nie über einen Seitenbereich hinaus: sonst erbt der
  // letzte Block des ersten Bereichs die Absätze, die im zweiten VOR dessen Statblock stehen.
  block = null;
  group = null;

  for (const f of fragmentsOf(xmlOf(range))) {
    if (f.role === 'entry') continue; // A–Z-Überschrift trägt keine Daten

    if (f.role === 'statname') {
      block = { name: plain(f.raw).trim(), page: f.page, type_line: '', ac: null, hp: null, cr: null, abilities: [], groups: {} };
      blocks.push(block);
      group = null;
      openName = false;
      continue;
    }
    if (!block) continue;

    if (f.role === 'section') {
      group = GROUPS[plain(f.raw).trim().toLowerCase()] ?? null;
      openName = false;
      continue;
    }

    // Die sechs Attributswerte sind der sprachfreie zweite Match-Schlüssel — RK/TP/HG allein
    // trifft 89 der 331 Kreaturen doppelt. Der Wert steht im ersten Zahlenfragment nach dem
    // Kapitälchen-Label, egal wie der Satz die Zelle zerlegt (` 17 +3 +3` oder ` 6` | `−2` | `2`).
    if (f.role === 'abilitylabel') {
      scoreNext = true;
      continue;
    }
    if (f.role === 'tablenum') {
      const value = plain(f.raw).trim();
      if (scoreNext && /^\d+/.test(value)) {
        block.abilities.push(parseInt(value, 10));
        scoreNext = false;
      }
      continue;
    }

    // Kopfzeilen stehen ausnahmslos VOR der ersten Abschnittsüberschrift. Innerhalb eines
    // Abschnitts ist dieselbe Schrift Fließtext: die Bonusaktion des Säbelzahntigers (S. 409)
    // ist im PDF versehentlich in der Kopfzeilen-Farbe gesetzt.
    if (f.role === 'header' && group === null) {
      // „<b>RK </b>17" — das Label steckt im Fettlauf, der Wert dahinter.
      const label = (f.raw.match(/<b>([^<]*)<\/b>/) ?? [])[1]?.trim().toLowerCase();
      const value = plain(f.raw.replace(/<b>[^<]*<\/b>/, '')).trim();
      if (label === 'rk') block.ac = parseInt(value, 10);
      if (label === 'tp') block.hp = parseInt(value, 10);
      if (label === 'hg') {
        const frac = value.match(/^(\d+)\s*\/\s*(\d+)/);
        block.cr = frac ? +frac[1] / +frac[2] : parseFloat(value);
      }
      continue;
    }

    if (f.role === 'aside') {
      // Erste graue Zeile eines Blocks ist die Typzeile; spätere sind Vorreden
      // („Anwendungen legendärer Aktionen: …") und gehören zu keinem Eintrag.
      if (!block.type_line && group === null) block.type_line = plain(f.raw).trim();
      continue;
    }

    const boldRuns = [...f.raw.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => plain(m[1])).join(' ');
    const rest = plain(f.raw.replace(/^<i>(<b>[\s\S]*?<\/b>)+/, '')).trim();

    if (/^<i><b>/.test(f.raw)) {
      const open = openName && lastEntry() && !lastEntry().parts.length;
      // Ein Name, der über zwei Zeilen bricht, kommt als zweiter <i><b>-Lauf ohne Fließtext.
      if (open) lastEntry().name += ` ${boldRuns}`;
      else currentList()?.push({ name: boldRuns, parts: [] });
      if (rest) lastEntry()?.parts.push(rest);
      openName = !rest;
      continue;
    }

    openName = false;
    lastEntry()?.parts.push(plain(f.raw));
  }
}

// ── Aufräumen und schreiben ───────────────────────────────────────────────────
// Ohne RK/TP/HG ist es kein Statblock, sondern eine rote Überschrift in derselben Schrift —
// so darf der Aufruf Seiten außerhalb des Anhangs mitnehmen.
const complete = blocks.filter((b) => b.ac !== null && b.hp !== null && b.cr !== null);

const records = complete.map((b) => ({
  name: dehyphenate(b.name),
  type_line: dehyphenate(b.type_line),
  ac: b.ac,
  hp: b.hp,
  cr: b.cr,
  abilities: b.abilities,
  page: b.page,
  groups: Object.fromEntries(
    Object.entries(b.groups).map(([g, list]) => [
      g,
      list.map((e) => ({
        name: dehyphenate(e.name).replace(/\s*:\s*$/, ''),
        desc: dehyphenate(e.parts.join(' ')),
      })),
    ]),
  ),
}));

const entryCount = records.reduce((sum, r) => sum + Object.values(r.groups).flat().length, 0);
console.error(`Statblöcke: ${records.length}, Einträge: ${entryCount}, verworfen: ${blocks.length - complete.length}`);
for (const r of records.filter((r) => r.abilities.length !== 6)) {
  console.error(`  ⚠ ${r.abilities.length} statt 6 Attributswerten: ${r.name} (S. ${r.page})`);
}
for (const r of records.filter((r) => Object.values(r.groups).flat().length === 0)) {
  console.error(`  ⚠ ohne Einträge: ${r.name} (S. ${r.page})`);
}

writeFileSync(OUT, JSON.stringify(records, null, 2) + '\n');
console.error(`→ ${OUT}`);
