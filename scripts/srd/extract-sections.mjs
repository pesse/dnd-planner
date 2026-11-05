#!/usr/bin/env node
/**
 * Schreibt ausgewählte Kapitelabschnitte beider SRD-PDFs als zusätzliche Regelbegriffe nach
 * `vault/rules/` — Nachschlagestoff, den das Glossar nicht führt (Berittener Kampf, Komponenten …).
 *
 * Aufruf:  node scripts/srd/extract-sections.mjs [--dry-run]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fragments, joinLines, render, slug } from './srdPdf.mjs';

const OUT_DIR = join(ROOT, 'vault/rules');
const DRY = process.argv.includes('--dry-run');

/** Regeln, Ausrüstung, Zauberwirken, magische Gegenstände, Werteblock — ohne die A–Z-Teile. */
const BOOKS = {
  en: { pdf: 'docs/srd/SRD_CC_v5.2.1.pdf', head: '#88191f', gray: '#7b7879', ranges: [[5, 27], [89, 107], [204, 208], [254, 257]] },
  de: { pdf: 'docs/srd/DE_SRD_CC_v5.2.1.pdf', head: '#8c2220', gray: '#808285', ranges: [[5, 32], [101, 122], [236, 241], [295, 299]] },
};

/**
 * Überschrift im PDF → `name`/`nameDe`; `name` steht, wo die Überschrift Anführungszeichen trägt.
 * `aside` = Titel eines Randkastens statt einer Überschrift.
 */
const SECTIONS = [
  { en: 'Exceptions Supersede General Rules', de: 'Ausnahmen ersetzen allgemeine Regeln', aside: true },
  { en: 'Marching Order', de: 'Marschreihenfolge', aside: true },
  { en: 'Playing on a Grid', de: 'Auf einem Raster spielen', aside: true },
  { en: 'Unseen Attackers and Targets', de: 'Ungesehene Angreifer und Ziele', aside: true },
  { en: 'Moving around Other Creatures', de: 'Sich um andere Kreaturen herumbewegen' },
  { en: 'Ranged Attacks in Close Combat', de: 'Fernkampfangriffe im Nahkampf' },
  { en: 'Mounted Combat', de: 'Berittener Kampf' },
  { en: 'Underwater Combat', de: 'Unterwasserkampf' },
  { en: 'Instant Death', de: 'Sofortiger Tod' },
  { en: 'Travel Pace', de: 'Reisegeschwindigkeit' },
  { en: 'Level Advancement', de: 'Stufenaufstiege' },
  { en: 'Starting at Higher Levels', de: 'Auf höheren Stufen beginnen' },
  { en: 'Bonus Feats at Level 20', de: 'Bonustalente auf Stufe 20', aside: true },
  { en: 'Unaligned Creatures', de: 'Gesinnungslose Kreaturen', aside: true },
  { en: 'Multiclassing', de: 'Klassenkombinationen' },
  { en: 'Selling Equipment', de: 'Ausrüstung verkaufen', aside: true },
  { en: 'Lifestyle Expenses', de: 'Lebenshaltungskosten' },
  { en: 'Food, Drink, and Lodging', de: 'Essen, Trinken und Unterkunft' },
  { en: 'Hirelings', de: 'Mietlinge' },
  { en: 'Identifying a Magic Item', de: 'Einen magischen Gegenstand identifizieren' },
  { en: 'Wearing and Wielding Items', de: 'Gegenstände tragen und führen' },
  { en: 'Crafting Nonmagical Items', de: 'Nichtmagische Gegenstände herstellen' },
  { en: 'Brewing Potions of Healing', de: 'Heiltränke brauen' },
  { en: 'Scribing Spell Scrolls', de: 'Zauberschriftrollen verfassen' },
  { en: 'Preparing Spells', de: 'Zauber vorbereiten' },
  { en: 'Spell Slots', de: 'Zauberplätze' },
  { en: 'Casting without Slots', de: 'Zauber wirken, ohne Zauberplätze zu verbrauchen' },
  { en: 'Using a Higher-Level Spell Slot', de: 'Verwenden von Zauberplätzen höheren Grades' },
  { en: 'School of Magic', de: 'Schule der Magie' },
  { en: 'Casting Time', de: 'Zeitaufwand' },
  { en: 'Components', de: 'Komponenten' },
  { en: 'Casting in Armor', de: 'Zaubern in Rüstung', aside: true },
  { en: 'Identifying an Ongoing Spell', de: 'Einen wirkenden Zauber identifizieren', aside: true },
  { en: 'Combining Spell Effects', de: 'Zaubereffekte kombinieren' },
  { en: 'Magic Item Rarity', de: 'Seltenheit magischer Gegenstände' },
  { en: 'Activating a Magic Item', de: 'Einen magischen Gegenstand aktivieren' },
  { en: '“The Next Dawn”', de: '„Nächstes Morgengrauen“', name: 'The Next Dawn', nameDe: 'Nächstes Morgengrauen' },
  { en: 'Cursed Items', de: 'Verfluchte Gegenstände' },
  { en: 'Magic Item Resilience', de: 'Haltbarkeit magischer Gegenstände' },
  { en: 'Crafting Magic Items', de: 'Magische Gegenstände herstellen' },
  { en: 'Sentient Magic Items', de: 'Intelligente magische Gegenstände' },
  { en: 'Multiattack', de: 'Mehrfachangriff' },
  { en: 'Legendary Actions', de: 'Legendäre Aktionen' },
  { en: 'Limited Usage', de: 'Begrenzter Einsatz' },
];

/**
 * Tabellen, deren Satz das Layout nicht hergibt (Kopf über mehrere Spalten, zwei Hälften
 * nebeneinander, Zellen über den Seitenumbruch) — vom PDF abgeschrieben, ersetzen Titel + Tabelle.
 */
const TABLE_FIXES = {
  'Food, Drink, and Lodging': `| Item | Cost |
|---|---|
| Ale (mug) | 4 CP |
| Bread (loaf) | 2 CP |
| Cheese (wedge) | 1 SP |
| *Inn Stay per Day* | |
| Squalid | 7 CP |
| Poor | 1 SP |
| Modest | 5 SP |
| Comfortable | 8 SP |
| Wealthy | 2 GP |
| Aristocratic | 4 GP |
| *Meal* | |
| Squalid | 1 CP |
| Poor | 2 CP |
| Modest | 1 SP |
| Comfortable | 2 SP |
| Wealthy | 3 SP |
| Aristocratic | 6 SP |
| *Wine (bottle)* | |
| Common | 2 SP |
| Fine | 10 GP |`,
  'Essen, Trinken und Unterkunft': `| Gegenstand | Kosten |
|---|---|
| Bier (Humpen) | 4 KM |
| Brot (Laib) | 2 KM |
| Käse (Ecke) | 1 SM |
| *Gasthaus (pro Nacht)* | |
| Ärmlich | 7 KM |
| Schlecht | 1 SM |
| Einfach | 5 SM |
| Komfortabel | 8 SM |
| Wohlhabend | 2 GM |
| Edel | 4 GM |
| *Mahlzeit* | |
| Ärmlich | 1 KM |
| Schlecht | 2 KM |
| Einfach | 1 SM |
| Komfortabel | 2 SM |
| Wohlhabend | 3 SM |
| Edel | 6 SM |
| *Wein (Flasche)* | |
| Gemeinsprache | 2 SM |
| Fein | 10 GM |`,
  'Spell Scroll Costs': `| Spell Level | Time | Cost |
|---|---|---|
| Cantrip | 1 day | 15 GP |
| 1 | 1 day | 25 GP |
| 2 | 3 days | 100 GP |
| 3 | 5 days | 150 GP |
| 4 | 10 days | 1,000 GP |
| 5 | 25 days | 1,500 GP |
| 6 | 40 days | 10,000 GP |
| 7 | 50 days | 12,500 GP |
| 8 | 60 days | 15,000 GP |
| 9 | 120 days | 50,000 GP |`,
  'Magic Item Rarities and Values': `| Rarity | Value* |
|---|---|
| Common | 100 GP |
| Uncommon | 400 GP |
| Rare | 4,000 GP |
| Very Rare | 40,000 GP |
| Legendary | 200,000 GP |
| Artifact | Priceless |

*Halve the value for a consumable item other than a *Spell Scroll*. The value of a *Spell Scroll* is double what it costs to scribe the scroll (as specified in the “Scribing Spell Scrolls” section of “Equipment”).`,
  'Seltenheit und Wert magischer Gegenstände': `| Seltenheit | Wert* |
|---|---|
| Gewöhnlich | 100 GM |
| Ungewöhnlich | 400 GM |
| Selten | 4.000 GM |
| Sehr selten | 40.000 GM |
| Legendär | 200.000 GM |
| Artefakt | Unbezahlbar |

*Halbiere den Wert für alle Verbrauchsgegenstände außer *Zauberschriftrollen*. Der Wert einer *Zauberschriftrolle* ist das Doppelte der Kosten zum Erstellen der Schriftrolle (wie unter „Ausrüstung“ im Abschnitt „Zauberschriftrollen verfassen“ angegeben).`,
  'Travel Pace': `| Pace | Per Minute | Per Hour | Per Day |
|---|---|---|---|
| Fast | 400 feet | 4 miles | 30 miles |
| Normal | 300 feet | 3 miles | 24 miles |
| Slow | 200 feet | 2 miles | 18 miles |`,
  Reisegeschwindigkeit: `| Geschwindigkeit | pro Minute | pro Stunde | pro Tag |
|---|---|---|---|
| Schnell | 120 m | 6,4 km | 48 km |
| Normal | 90 m | 4,8 km | 38,4 km |
| Langsam | 60 m | 3,2 km | 28,8 km |`,
  'Anfangsausrüstung auf höheren Stufen': `| Anfangsstufe | Ausrüstung und Geld | Magische Gegenstände |
|---|---|---|
| 2–4 | Normale Anfangsausrüstung | 1 gewöhnlicher |
| 5–10 | 500 GM plus 1W10 × 25 GM plus normale Anfangsausrüstung | 1 gewöhnlicher, 1 ungewöhnlicher |
| 11–16 | 5.000 GM plus 1W10 × 250 GM plus normale Anfangsausrüstung | 2 gewöhnliche, 3 ungewöhnliche, 1 seltener |
| 17–20 | 20.000 GM plus 1W10 × 250 GM plus normale Anfangsausrüstung | 2 gewöhnliche, 4 ungewöhnliche, 3 seltene, 1 sehr seltener |`,
  'Klassenkombinationen für Zauberwirker: Zauberplätze pro Zaubergrad': `| Stufe | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | — | — | — | — | — | — | — | — |
| 2 | 3 | — | — | — | — | — | — | — | — |
| 3 | 4 | 2 | — | — | — | — | — | — | — |
| 4 | 4 | 3 | — | — | — | — | — | — | — |
| 5 | 4 | 3 | 2 | — | — | — | — | — | — |
| 6 | 4 | 3 | 3 | — | — | — | — | — | — |
| 7 | 4 | 3 | 3 | 1 | — | — | — | — | — |
| 8 | 4 | 3 | 3 | 2 | — | — | — | — | — |
| 9 | 4 | 3 | 3 | 3 | 1 | — | — | — | — |
| 10 | 4 | 3 | 3 | 3 | 2 | — | — | — | — |
| 11 | 4 | 3 | 3 | 3 | 2 | 1 | — | — | — |
| 12 | 4 | 3 | 3 | 3 | 2 | 1 | — | — | — |
| 13 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | — | — |
| 14 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | — | — |
| 15 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | — |
| 16 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | — |
| 17 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | 1 |
| 18 | 4 | 3 | 3 | 3 | 3 | 1 | 1 | 1 | 1 |
| 19 | 4 | 3 | 3 | 3 | 3 | 2 | 1 | 1 | 1 |
| 20 | 4 | 3 | 3 | 3 | 3 | 2 | 2 | 1 | 1 |`,
  'Magic Item Crafting Time and Cost': `| Item Rarity | Time* | Cost* |
|---|---|---|
| Common | 5 days | 50 GP |
| Uncommon | 10 days | 200 GP |
| Rare | 50 days | 2,000 GP |
| Very Rare | 125 days | 20,000 GP |
| Legendary | 250 days | 100,000 GP |

*The time and cost are halved for a consumable item other than a *Spell Scroll*, whose crafting time and cost are given in “Equipment.”`,
  'Herstellen magischer Gegenstände: Dauer und Kosten': `| Seltenheit des Gegenstands | Dauer* | Kosten* |
|---|---|---|
| Gewöhnlich | 5 Tage | 50 GM |
| Ungewöhnlich | 10 Tage | 200 GM |
| Selten | 50 Tage | 2.000 GM |
| Sehr selten | 125 Tage | 20.000 GM |
| Legendär | 250 Tage | 100.000 GM |

*Dauer und Kosten sind bei Verbrauchsgegenständen halbiert. Ausnahme: *Zauberschriftrollen*. Bei diesen sind Dauer und Kosten unter „Ausrüstung“ angegeben.`,
  'Sentient Item’s Alignment': `| 1d100 | Alignment |
|---|---|
| 01–15 | Lawful Good |
| 16–35 | Neutral Good |
| 36–50 | Chaotic Good |
| 51–63 | Lawful Neutral |
| 64–73 | Neutral |
| 74–85 | Chaotic Neutral |
| 86–89 | Lawful Evil |
| 90–96 | Neutral Evil |
| 97–00 | Chaotic Evil |`,
  'Gesinnung intelligenter magischer Gegenstände': `| 1W100 | Gesinnung |
|---|---|
| 1–15 | Rechtschaffen gut |
| 16–35 | Neutral gut |
| 36–50 | Chaotisch gut |
| 51–63 | Rechtschaffen neutral |
| 64–73 | Neutral |
| 74–85 | Chaotisch neutral |
| 86–89 | Rechtschaffen böse |
| 90–96 | Neutral böse |
| 97–100 | Chaotisch böse |`,
  'Sentient Item’s Special Purpose': `| 1d10 | Special Purpose |
|---|---|
| 1 | **Aligned.** The item seeks to defeat or destroy those of a diametrically opposed alignment. Such an item is never Neutral. |
| 2 | **Bane.** The item seeks to thwart or destroy creatures of a particular type, such as Constructs, Fiends, or Undead. |
| 3 | **Creator Seeker.** The item seeks its creator and wants to understand why it was created. |
| 4 | **Destiny Seeker.** The item believes it and its bearer have key roles to play in future events. |
| 5 | **Destroyer.** The item craves destruction and goads its user to fight arbitrarily. |
| 6 | **Glory Seeker.** The item seeks renown as the greatest magic item in the world by winning fame or notoriety for its user. |
| 7 | **Lore Seeker.** The item craves knowledge or is determined to solve a mystery, learn a secret, or unravel a cryptic prophecy. |
| 8 | **Protector.** The item seeks to defend a particular kind of creature, such as elves or werewolves. |
| 9 | **Soulmate Seeker.** The item seeks another sentient magic item, perhaps one that is similar to itself. |
| 10 | **Templar.** The item seeks to defend the servants and interests of a particular deity. |`,
  'Besondere Ziele intelligenter magischer Gegenstände': `| 1W10 | Besonderes Ziel |
|---|---|
| 1 | **Gesinnung:** Der Gegenstand will alle mit entgegengesetzter Gesinnung besiegen oder zerstören. Ein solcher Gegenstand ist niemals neutral. |
| 2 | **Verderben:** Der Gegenstand will Kreaturen eines bestimmten Typs schaden oder sie zerstören, beispielsweise Konstrukte, Unholde oder Untote. |
| 3 | **Schöpfersucher:** Der Gegenstand sucht seinen Schöpfer und will begreifen, warum er erschaffen wurde. |
| 4 | **Schicksalssucher:** Der Gegenstand glaubt, dass sein Träger und er bei künftigen Ereignissen eine Schlüsselrolle spielen. |
| 5 | **Zerstörer:** Der Gegenstand giert nach Zerstörung und stachelt seinen Träger zu mutwilligen Kämpfen an. |
| 6 | **Ruhmsucher:** Der Gegenstand will als großartigster magischer Gegenstand der Welt anerkannt werden, damit sein Träger berühmt oder berüchtigt wird. |
| 7 | **Wissenssucher:** Der Gegenstand giert nach Wissen oder ist entschlossen, ein Rätsel zu lösen, ein Geheimnis zu erfahren oder eine kryptische Prophezeiung zu entschleiern. |
| 8 | **Beschützer:** Der Gegenstand will eine bestimmte Art von Kreaturen verteidigen, zum Beispiel Elfen oder Werwölfe. |
| 9 | **Seelenverwandten-Sucher:** Der Gegenstand sucht nach einem anderen intelligenten magischen Gegenstand, vielleicht nach einem, der wie er ist. |
| 10 | **Tempelritter:** Der Gegenstand will die Diener und Interessen einer bestimmten Gottheit verteidigen. |`,
};

/** Ersetzt hinter dem Titel die Tabellenblöcke — oder, steht dort keine Tabelle, den einen Block. */
function fixTables(md) {
  const blocks = md.split('\n\n');
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const title = blocks[i].match(/^\*\*(.+)\*\*$/)?.[1];
    if (!title || !(title in TABLE_FIXES)) {
      out.push(blocks[i]);
      continue;
    }
    out.push(blocks[i], TABLE_FIXES[title]);
    if (blocks[i + 1]?.startsWith('|')) while (blocks[i + 1]?.startsWith('|')) i++;
    else i++;
  }
  return out.join('\n\n');
}

const LEVELS = { 27: 1, 21: 2, 18: 3 };
const sectionHead = (size) => (size >= 35 ? 'chapter' : LEVELS[size] ? `h${LEVELS[size]}` : 'skip');
const levelOf = (f) => (f.kind === 'chapter' ? 0 : /^h\d$/.test(f.kind) ? +f.kind[1] : null);

/** Fragmente aller Bereiche; eine über mehrere Zeilen umbrochene Überschrift wird eins. */
function stream(book) {
  const out = [];
  for (const [from, to] of book.ranges) {
    for (const f of fragments(book, sectionHead, from, to)) {
      const prev = out[out.length - 1];
      if (levelOf(f) && prev?.kind === f.kind) prev.text = joinLines([prev.text, f.text.replace(/\*\*/g, '')]);
      else out.push({ ...f, text: levelOf(f) ? f.text.replace(/\*\*/g, '').trim() : f.text });
    }
    out.push({ kind: 'chapter', text: '' });
  }
  return out;
}

const norm = (s) => s.toLowerCase().replace(/[‑-]/g, '-').replace(/\s+/g, ' ').trim();

function aside(frags, title) {
  const at = frags.flatMap((f, i) => (f.kind === 'asideTitle' && norm(f.text) === norm(title) ? [i] : []));
  if (at.length !== 1) return { error: `${at.length}× gefunden` };
  const lines = [];
  for (const f of frags.slice(at[0] + 1)) {
    if (f.kind !== 'aside') break;
    const row = lines.find((r) => r.page === f.page && Math.abs(r.top - f.top) <= 3);
    if (row) row.parts.push(f);
    else lines.push({ page: f.page, top: f.top, parts: [f] });
  }
  // Ein Absatz beginnt eingerückt (EN: mit Leerzeichen, DE: weiter rechts) oder mit einem fetten Stichwort.
  const paras = [];
  const base = Math.min(...lines.map((r) => Math.min(...r.parts.map((p) => p.left))));
  for (const r of lines) {
    r.parts.sort((a, b) => a.left - b.left);
    const text = r.parts.map((p) => p.text).join('');
    if (!paras.length || /^\s/.test(text) || /^\*\*/.test(text) || r.parts[0].left > base + 6) paras.push([text]);
    else paras[paras.length - 1].push(text);
  }
  return { md: paras.map(joinLines).join('\n\n') };
}

/** Der Abschnitt bis zur nächsten Überschrift gleicher oder höherer Ebene; Unterüberschriften werden fette Absatzanfänge. */
function section(frags, heading) {
  const at = frags.flatMap((f, i) => (levelOf(f) && norm(f.text) === norm(heading) ? [i] : []));
  if (at.length !== 1) return { error: `${at.length}× gefunden` };
  const level = levelOf(frags[at[0]]);
  const body = [];
  for (const f of frags.slice(at[0] + 1)) {
    const l = levelOf(f);
    if (l !== null && l <= level) break;
    if (f.kind === 'aside' || f.kind === 'asideTitle') continue;
    body.push(l === null ? f : { kind: 'body', indent: true, text: ` **${f.text.replace(/[.:]$/, '')}.**` });
  }
  return { md: fixTables(render(body)) };
}

const en = stream(BOOKS.en);
const de = stream(BOOKS.de);
let failed = 0;
for (const s of SECTIONS) {
  const pick = s.aside ? aside : section;
  const e = pick(en, s.en);
  const d = pick(de, s.de);
  if (e.error || d.error) {
    failed++;
    console.error(`  FEHLT: ${s.en} (${e.error ?? 'ok'}) / ${s.de} (${d.error ?? 'ok'})`);
    continue;
  }
  const name = s.name ?? s.en;
  const file = join(OUT_DIR, `${slug(name)}.json`);
  if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).name !== name) throw new Error(`${file} gehört einem anderen Begriff`);
  const rule = { key: `srd-2024_${slug(name)}`, source: 'srd-2024', name, nameDe: s.nameDe ?? s.de, category: 'rule', desc: e.md, descDe: d.md };
  if (DRY) console.log(`\n=== ${name} / ${rule.nameDe}\n${e.md}\n---\n${d.md}`);
  else writeFileSync(file, JSON.stringify(rule, null, 2) + '\n');
}
console.error(`${SECTIONS.length - failed}/${SECTIONS.length} Abschnitte`);
if (failed) process.exitCode = 1;
