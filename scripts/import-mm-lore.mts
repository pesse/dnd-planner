/**
 * Importiert die Beschreibungstexte des Monster Manual 2024 aus gespeicherten D&D-Beyond-Seiten
 * nach `vault/monster-lore/` (eine Datei je Familie). Gepflegtes Deutsch bleibt beim Re-Import.
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/import-mm-lore.mts --outfile=/tmp/import-mm-lore.mjs \
 *   && node /tmp/import-mm-lore.mjs <html-ordner> [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { monsterLoreSchema, type MonsterLore } from '$lib/schemas/monsterLore';
import { loreFamilies } from './mm/lore';

const SOURCE = 'mm-2024';
const VAULT_MONSTERS = 'vault/monsters';
const VAULT_LORE = 'vault/monster-lore';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const HTML_DIR = args.find((a) => !a.startsWith('--'));

const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function walkJson(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walkJson(p) : name.endsWith('.json') ? [p] : [];
  });
}

/** Statblock-Name → Dateiname des Monsters; das Kapitel „Animals" hat keine Beschreibungen. */
function monsterSlugs(): Map<string, string> {
  const slugs = new Map<string, string>();
  for (const path of walkJson(VAULT_MONSTERS)) {
    const nameEn = (JSON.parse(readFileSync(path, 'utf8')) as { name_en?: string }).name_en;
    if (nameEn) slugs.set(nameEn.toLowerCase(), path.split('/').pop()!.replace(/\.json$/, ''));
  }
  return slugs;
}

/** Deutsch einer früheren Fassung übernehmen; geänderter englischer Text wird gemeldet. */
function keepGerman(lore: MonsterLore, old: MonsterLore, notes: string[]): void {
  for (const field of ['name', 'tagline', 'habitat', 'treasure', 'intro'] as const) {
    const de = `${field}De` as const;
    if (!old[de]) continue;
    lore[de] = old[de];
    if (old[field] !== lore[field]) notes.push(`${lore.name}: englisches ${field} geändert, Deutsch prüfen`);
  }
  const before = new Map(old.monsters.map((m) => [m.slug, m]));
  for (const entry of lore.monsters) {
    const prev = before.get(entry.slug);
    if (!prev?.introDe) continue;
    entry.introDe = prev.introDe;
    if (prev.intro !== entry.intro) notes.push(`${lore.name}/${entry.slug}: englische Einleitung geändert, Deutsch prüfen`);
  }
}

function main() {
  if (!HTML_DIR) throw new Error('Aufruf: import-mm-lore <html-ordner> [--dry-run]');
  const slugs = monsterSlugs();
  const notes: string[] = [];
  let written = 0;
  const pages = readdirSync(HTML_DIR).filter((f) => f.startsWith('Monsters (') && f.endsWith('.html')).sort();
  for (const page of pages) {
    for (const family of loreFamilies(readFileSync(join(HTML_DIR, page), 'utf8'))) {
      const slug = slugify(family.name);
      const monsters = family.monsters.flatMap(({ statBlock, intro }) => {
        const monster = slugs.get(statBlock.toLowerCase());
        if (!monster) notes.push(`${family.name}: Statblock „${statBlock}" hat kein Monster im Vault`);
        return monster ? [{ slug: monster, intro }] : [];
      });
      if (!monsters.length) notes.push(`${family.name}: kein Monster zugeordnet`);
      const lore = monsterLoreSchema.parse({ ...family, key: `${SOURCE}_${slug}`, source: SOURCE, monsters });
      const path = join(VAULT_LORE, `${slug}.json`);
      if (existsSync(path)) keepGerman(lore, monsterLoreSchema.parse(JSON.parse(readFileSync(path, 'utf8'))), notes);
      written++;
      if (DRY_RUN) continue;
      mkdirSync(VAULT_LORE, { recursive: true });
      writeFileSync(path, `${JSON.stringify(lore, null, 2)}\n`, 'utf8');
    }
  }
  console.log(`${written} Familien${DRY_RUN ? ' (dry-run)' : ''}.`);
  if (notes.length) console.log(`\nHinweise:\n  ${notes.join('\n  ')}`);
}

main();
