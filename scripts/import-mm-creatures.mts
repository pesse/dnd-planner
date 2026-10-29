/**
 * Importiert die Statblöcke des Monster Manual 2024 aus gespeicherten D&D-Beyond-Seiten. Was das
 * SRD schon führt (`srd-2024`, Match über `name_en`), wird nicht angelegt, sondern nur verglichen;
 * alles andere landet als `mm-2024` in `vault/monsters/`. Gepflegtes Deutsch bleibt beim Re-Import.
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/import-mm-creatures.mts --outfile=/tmp/import-mm.mjs \
 *   && node /tmp/import-mm.mjs <html-ordner> [--dry-run] [--fix-srd] [--report <srd-abgleich.json>]
 *
 * `--fix-srd` zieht die englische Seite der SRD-Monster auf den MM-Statblock nach (`mm/fixSrd.ts`)
 * — nach jedem `import-open5e-creatures` erneut fahren, der die Open5e-Fehler zurückbringt.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mapOpen5eCreature } from '$lib/services/open5eCreatureMapper';
import { parseMonster } from '$lib/utils/schemaValidation';
import { MONSTER_TYPE_DIR } from '$lib/types';
import type { Monster } from '$lib/schemas/monster';
import { parseStatBlock, statBlockHtml } from './mm/statBlocks';
import { compareWithSrd } from './mm/compareSrd';
import { fixSrdFromMm } from './mm/fixSrd';

const SOURCE = 'mm-2024';
const VAULT_MONSTERS = 'vault/monsters';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FIX_SRD = args.includes('--fix-srd');
const REPORT = args.includes('--report') ? args[args.indexOf('--report') + 1] : '';
const HTML_DIR = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--report');

const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function walkJson(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walkJson(p) : name.endsWith('.json') ? [p] : [];
  });
}

/** Rüstungsteile der „Gear"-Zeile; Waffen stehen ohnehin in den Aktionen. */
const ARMOR = /armor|mail|plate|shield|leather|hide|breastplate/i;

const entryId = (e: { name_en: string }, type = 'TRAIT') => `${type}:${e.name_en}`;

/** Das gepflegte Deutsch einer früheren Fassung übernehmen; englische Änderungen melden. */
function keepGerman(monster: Monster, old: Monster, notes: string[]): void {
  monster.name = old.name;
  monster.languages = old.languages;
  monster.languages_desc = old.languages_desc;
  monster.armor_detail = old.armor_detail;
  monster.defenses_desc = old.defenses_desc;
  monster.tags = old.tags;
  const before = new Map<string, { name: string; desc: string; desc_en: string }>([
    ...old.traits.map((t) => [entryId(t), t] as const),
    ...old.actions.map((a) => [entryId(a, a.action_type), a] as const),
  ]);
  const apply = (entry: { name: string; name_en: string; desc: string; desc_en: string }, id: string) => {
    const prev = before.get(id);
    if (!prev) return notes.push(`${monster.name_en}: „${entry.name_en}" neu, ohne Deutsch`);
    entry.name = prev.name;
    entry.desc = prev.desc;
    if (prev.desc_en !== entry.desc_en) notes.push(`${monster.name_en}: „${entry.name_en}" englisch geändert, Deutsch prüfen`);
  };
  monster.traits.forEach((t) => apply(t, entryId(t)));
  monster.actions.forEach((a) => apply(a, entryId(a, a.action_type)));
}

function main(): void {
  if (!HTML_DIR) throw new Error('Aufruf: import-mm.mjs <html-ordner> [--dry-run] [--report <datei>]');
  const existing = walkJson(VAULT_MONSTERS).map((path) => ({ path, data: JSON.parse(readFileSync(path, 'utf8')) as Monster }));
  const byNameEn = new Map(existing.map((e) => [`${e.data.source}:${e.data.name_en.toLowerCase()}`, e]));
  const fileNames = new Map(existing.map((e) => [e.path.split('/').pop()!, e]));

  const pages = readdirSync(HTML_DIR).filter((f) => f.endsWith('.html')).sort();
  const blocks = pages.flatMap((f) => statBlockHtml(readFileSync(join(HTML_DIR, f), 'utf8')).map(parseStatBlock));
  console.log(`${pages.length} Seiten, ${blocks.length} Statblöcke.`);

  const srdPairs: [Monster, Monster][] = [];
  const srdFixes: string[] = [];
  const notes: string[] = [];
  const written = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const block of blocks) {
    for (const w of block.warnings) notes.push(`${block.raw.name}: ${w}`);
    const monster = mapOpen5eCreature({ ...block.raw, document: { key: SOURCE }, key: `${SOURCE}_${slugify(String(block.raw.name))}` });
    monster.armor_detail = block.gear.filter((g) => ARMOR.test(g)).join(', ');
    monster.defenses_desc = block.defenseNotes.join(', ');

    const srd = byNameEn.get(`srd-2024:${monster.name_en.toLowerCase()}`);
    if (srd) {
      srdPairs.push([monster, structuredClone(srd.data)]);
      const fixes = FIX_SRD ? fixSrdFromMm(srd.data, monster) : [];
      srdFixes.push(...fixes);
      if (fixes.length && !DRY_RUN) writeFileSync(srd.path, `${JSON.stringify(srd.data, null, 2)}\n`, 'utf8');
      continue;
    }

    const parsed = parseMonster(monster);
    if (!parsed.ok) throw new Error(`Ungültig: ${monster.name_en}\n  ${parsed.errors.join('\n  ')}`);

    const old = byNameEn.get(`${SOURCE}:${monster.name_en.toLowerCase()}`);
    if (old) keepGerman(monster, old.data, notes);
    const fileName = old ? old.path.split('/').pop()! : `${slugify(monster.name_en)}.json`;
    const target = join(VAULT_MONSTERS, MONSTER_TYPE_DIR[monster.type], fileName);
    const clash = fileNames.get(fileName);
    if ((clash && clash !== old) || written.has(fileName)) {
      throw new Error(`Dateiname ${fileName} (${monster.name_en}) ist schon vergeben: ${clash?.path ?? 'in diesem Lauf'}`);
    }
    written.add(fileName);
    if (old && old.path !== target) notes.push(`${monster.name_en}: Typ geändert, ${old.path} → ${target} von Hand verschieben`);
    old ? updated++ : created++;
    if (DRY_RUN) continue;
    mkdirSync(join(VAULT_MONSTERS, MONSTER_TYPE_DIR[monster.type]), { recursive: true });
    writeFileSync(old?.path ?? target, `${JSON.stringify(monster, null, 2)}\n`, 'utf8');
  }

  const matched = new Set(srdPairs.map(([, s]) => s.name_en));
  const unmatched = existing.filter((e) => e.data.source === 'srd-2024' && !matched.has(e.data.name_en));
  console.log(`SRD: ${srdPairs.length} zugeordnet, ${unmatched.length} SRD-Monster ohne MM-Statblock: ${unmatched.map((e) => e.data.name_en).join(', ')}`);
  console.log(`${SOURCE}: ${created} neu, ${updated} aktualisiert${DRY_RUN ? ' (dry-run)' : ''}.`);
  if (REPORT) {
    const diffs = srdPairs.map(([mm, srd]) => ({ name_en: srd.name_en, diffs: compareWithSrd(mm, srd) })).filter((d) => d.diffs.length);
    writeFileSync(REPORT, `${JSON.stringify(diffs, null, 2)}\n`, 'utf8');
    console.log(`SRD-Abgleich: ${diffs.length} Monster mit Abweichungen → ${REPORT}`);
  }
  if (FIX_SRD) console.log(`\nSRD-Korrekturen (${srdFixes.length}):\n  ${srdFixes.join('\n  ')}`);
  if (notes.length) console.log(`\nHinweise:\n  ${notes.join('\n  ')}`);
}

main();
