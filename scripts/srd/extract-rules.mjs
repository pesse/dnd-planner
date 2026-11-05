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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fragments, render, slug } from './srdPdf.mjs';

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

/** Größer als ein Stichwort = Kapitelüberschrift: dahinter beginnt der Anhang. */
const glossaryHead = (size) => (size > 20 ? 'chapter' : size >= 17 ? 'head' : 'skip');

function entries(book) {
  const out = [];
  let cur = null;
  for (const f of fragments(book, glossaryHead)) {
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
