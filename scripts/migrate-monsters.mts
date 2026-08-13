/**
 * Schreibt `upgradeLegacyMonster` über alle Monsterdateien des Vaults fest — die globale
 * Bibliothek unter `vault/monsters` und die akt-lokalen Monsterordner unter `vault/campaigns`.
 * Dry-Run ist der Default, `--apply` schreibt.
 *
 * Zweiter Teil, die Eindeutschung der englischen Kopien: viele akt-lokale Dateien sind englische
 * SRD-Monster. Sie bekommen den offiziellen deutschen Text — zuerst über den vollen Zahlen-
 * schlüssel gegen `scripts/srd/monsters-de.json` (RK, TP, HG und alle sechs Attributswerte, denn
 * hier steht auch Homebrew in der Liste), danach über den englischen Namen gegen die schon
 * eingedeutschte Bibliothek unter `vault/monsters`. Runde B greift also erst, NACHDEM
 * `import-open5e-creatures.mts` gelaufen ist — dann diesen Lauf einfach wiederholen.
 *
 * Eine deutsch verfasste Datei bleibt unangetastet: sie braucht keine Übersetzung, und ihre Prosa
 * ist handgepflegtes Homebrew auf einem SRD-Statblock (`Wartungssalamander`).
 *
 * Geschrieben wird das angehobene ROHOBJEKT, nicht das Parse-Ergebnis: Felder, die das Schema
 * nicht kennt (`description`, `tactics`, `notes` an akt-lokalen Monstern), sind handgeschriebene
 * Spielleiter-Prosa und dürfen nicht durch eine Normalisierung verschwinden.
 *
 * `parseMonster` ist nur das Gate: was danach nicht parst, wird NICHT geschrieben, sondern
 * gemeldet — ein geratener Wert wäre schlimmer als eine Datei, die man von Hand nachzieht.
 *
 * Lauf (TypeScript → über esbuild gebündelt):
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/migrate-monsters.mts --outfile=/tmp/migrate-monsters.mjs \
 *   && node /tmp/migrate-monsters.mjs [--apply]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { migrateMonsterLegacy } from '$lib/schemas/monster';
import { parseMonster } from '$lib/utils/schemaValidation';
import type { Monster } from '$lib/schemas/monster';
import {
  applyGermanText,
  captureEnglishOriginal,
  germanFromMonster,
  loadGermanCreatures,
  matchGermanCreatures,
  type GermanCreature,
} from './srd/germanCreatures';

const APPLY = process.argv.includes('--apply');
const VAULT_MONSTERS = 'vault/monsters';
const VAULT_CAMPAIGNS = 'vault/campaigns';

function walkJson(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJson(p, keep));
    else if (name.endsWith('.json') && keep(p)) out.push(p);
  }
  return out;
}

function monsterFiles(): string[] {
  return [
    ...walkJson(VAULT_MONSTERS, () => true),
    ...walkJson(VAULT_CAMPAIGNS, (p) => p.includes('/monsters/')),
  ];
}

interface Candidate {
  path: string;
  raw: Record<string, unknown>;
  before: string;
  monster: Monster;
}

const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Die eingedeutschte Bibliothek, adressiert über den englischen Namen ihrer Monster. */
function germanLibrary(candidates: Candidate[]): Map<string, Candidate> {
  const out = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const { path, monster } = candidate;
    if (!path.startsWith(`${VAULT_MONSTERS}/`) || !monster.name_en) continue;
    out.set(slugify(monster.name_en), candidate);
  }
  return out;
}

const failed: string[] = [];
const migrated: string[] = [];
const translated: string[] = [];
const germanNotes: string[] = [];
const candidates: Candidate[] = [];
let unchanged = 0;

for (const path of monsterFiles()) {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    failed.push(`${path}: JSON-Fehler (${e})`);
    continue;
  }

  // Vor dem Aufruf: `migrateSourceLegacy` setzt `source` am übergebenen Objekt selbst.
  const before = JSON.stringify(raw);
  const upgraded = migrateMonsterLegacy(raw);

  const parsed = parseMonster(upgraded);
  if (!parsed.ok) {
    failed.push(`${path}: ${parsed.errors.join('; ')}`);
    continue;
  }
  candidates.push({ path, raw: upgraded, before, monster: parsed.data });
}

const byNumbers = matchGermanCreatures(
  candidates.map((c) => c.monster),
  loadGermanCreatures(),
  { fallback: false },
);
const byEnglishName = germanLibrary(candidates);
const stillEnglish: string[] = [];

for (const { path, raw, before, monster } of candidates) {
  // Erst die Sprachprobe: sie füllt `*_en` der englisch verfassten Einträge und markiert damit,
  // was überhaupt zu übersetzen ist. Deutsche Einträge lässt `applyGermanText` dann stehen.
  const wasEnglish = captureEnglishOriginal(monster);
  const ownName = monster.name;
  // Ein Treffer über den englischen Namen BEWEIST, dass `name` das Original ist — nur dann darf
  // der deutsche SRD-Name ihn ersetzen. Der Zahlen-Treffer beweist das nicht („Wartungssalamander"
  // ist ein Reskin des Salamanders und behält seinen Namen).
  const source = byEnglishName.get(slugify(ownName));
  const fromLibrary = source && source.path !== path ? germanFromMonster(source.monster) : undefined;
  const german = fromLibrary ?? byNumbers.get(monster);

  if (german) {
    const germanBefore = JSON.stringify([monster.name, monster.traits, monster.actions]);
    // `extras: false`: hier steht Homebrew auf SRD-Statblöcken — ein nur im SRD geführtes Merkmal
    // wäre keine Übersetzung, sondern neue Mechanik.
    const notes = applyGermanText(monster, german, { extras: false });
    if (fromLibrary) monster.name_en ||= ownName;
    else monster.name = ownName;
    // Nur die Felder zurückschreiben, die der Deutsch-Lauf anfasst — alles andere am Rohobjekt
    // bleibt unberührt, inklusive der Prosa, die das Schema nicht kennt.
    raw.name = monster.name;
    raw.name_en = monster.name_en;
    raw.traits = monster.traits;
    raw.actions = monster.actions;
    if (germanBefore !== JSON.stringify([monster.name, monster.traits, monster.actions])) {
      const from = german.page ? `SRD S. ${german.page}` : 'Bibliothek';
      translated.push(`${path}  (${monster.name}${monster.name === ownName ? '' : ` ← ${ownName}`}, ${from})`);
      if (notes.length) germanNotes.push(`${ownName} (${from}):\n    ${notes.join('\n    ')}`);
    }
  } else if (wasEnglish) {
    stillEnglish.push(`${path}  (${monster.name})`);
    raw.name_en = monster.name_en;
    raw.traits = monster.traits;
    raw.actions = monster.actions;
  }

  const after = JSON.stringify(raw);
  if (before === after) {
    unchanged++;
    continue;
  }
  const regate = parseMonster(raw);
  if (!regate.ok) {
    failed.push(`${path}: nach dem Deutsch-Lauf ungültig — ${regate.errors.join('; ')}`);
    continue;
  }
  migrated.push(`${path}  (${String(raw.name)})`);
  if (APPLY) writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

console.log(`\n${migrated.length} Datei(en) angehoben, ${unchanged} unverändert:\n`);
for (const line of migrated) console.log(`  ✓ ${line}`);

console.log(`\n${translated.length} Datei(en) mit deutschem SRD-Text:`);
for (const line of translated) console.log(`  ⇄ ${line}`);

if (stillEnglish.length) {
  console.log(`\n${stillEnglish.length} englische Datei(en) ohne deutsche Quelle — Text bleibt englisch:`);
  for (const line of stillEnglish) console.log(`  – ${line}`);
}

if (germanNotes.length) {
  console.log(`\nNicht übertragene oder ergänzte Einträge:`);
  for (const line of germanNotes) console.log(`  • ${line}`);
}

if (failed.length) {
  console.log(`\n${failed.length} Datei(en) NICHT geschrieben — von Hand nachziehen:`);
  for (const line of failed) console.log(`  ✗ ${line}`);
}

console.log(APPLY ? `\n✓ Geschrieben.` : `\n(Dry-Run — mit "--apply" ausführen.)`);
