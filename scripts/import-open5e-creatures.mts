/**
 * Importiert die srd-2024-Kreaturen aus Open5e v2 (`/v2/creatures/`) in die Vault-Bibliothek
 * `vault/monsters/`. Ablage nach Creature-Type über `MONSTER_TYPE_DIR`, Dateiname aus dem
 * Open5e-Slug — bei einem Bestandstreffer bleibt der bestehende (deutsche) Dateiname, weil
 * er die Identität ist, an der Encounter per `{"slug": …}` hängen.
 *
 * Deutsch kommt aus dem deutschen SRD-PDF: `scripts/srd/monsters-de.json` (erzeugt von
 * `scripts/srd/extract-monsters.mjs`) liefert Namen und die Texte aller Merkmale und Aktionen,
 * zugeordnet über die Zahlen des Statblocks — siehe `scripts/srd/germanCreatures.ts`. Was der
 * Lauf nicht zuordnen kann, listet er am Ende auf; dort bleibt der englische Text stehen.
 *
 * Aus dem Bestand übernimmt er nur, was das PDF nicht kennt: `tags` und den bisherigen
 * (deutschen) Dateinamen, gematcht über `name_en` bzw. das Legacy-Feld `index`.
 *
 * Homebrew bleibt unangetastet: eine Zieldatei, die nicht selbst der Bestandstreffer ist und
 * kein `source: "srd-2024"` trägt, bricht den Lauf ab statt überschrieben zu werden.
 *
 * **Gate:** jede gemappte Kreatur muss `parseMonster` bestehen, sonst bricht der Lauf ab.
 *
 * Lauf (TypeScript → über esbuild gebündelt):
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/import-open5e-creatures.mts --outfile=/tmp/import-creatures.mjs \
 *   && node /tmp/import-creatures.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { mapOpen5eCreature } from '$lib/services/open5eCreatureMapper';
import { parseMonster } from '$lib/utils/schemaValidation';
import { MONSTER_TYPE_DIR } from '$lib/types';
import { keySlug } from '$lib/utils/text';
import type { Monster } from '$lib/schemas/monster';
import { applyGermanText, loadGermanCreatures, matchGermanCreatures } from './srd/germanCreatures';

const DRY_RUN = process.argv.includes('--dry-run');
const VAULT_MONSTERS = 'vault/monsters';
// Bei Kreaturen filtert `document__key=`; `document=` wird still ignoriert und liefert alle 3541.
const OPEN5E_CREATURES = 'https://api.open5e.com/v2/creatures/?document__key=srd-2024&limit=100&format=json';

const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function fetchPaginated(startUrl: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let url: string | null = startUrl;
  while (url) {
    const page = (await fetch(url).then((r) => r.json())) as { results?: Record<string, unknown>[]; next?: string | null };
    out.push(...(page.results ?? []));
    url = page.next ?? null;
  }
  return out;
}

interface OldEntry {
  name: string;
  tags: string[];
  /** Merkmale/Aktionen mit deutschem Text — nur ein Verlust, wenn das SRD-PDF nicht greift. */
  germanTexts: string[];
  path: string;
}

function walkJson(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJson(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const readJson = (path: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/** Namen der Einträge, deren `desc`/`description` nicht englisch aus Open5e stammt. */
function germanEntries(data: Record<string, unknown>): string[] {
  const lists = ['traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions'];
  return lists.flatMap((field) =>
    (Array.isArray(data[field]) ? (data[field] as Record<string, unknown>[]) : [])
      .filter((e) => e && typeof e === 'object' && (e.description || e.desc))
      .map((e) => String(e.name ?? '')),
  );
}

/**
 * Bestandsindex über den englischen Handle: `name_en` im neuen Format, `index` im alten.
 * Beides in Slug-Form, weil `index` schon ein Slug ist und `name_en` ein Name.
 * Er liefert nur noch Dateiname und `tags` — die Texte kommen aus dem deutschen SRD.
 */
function buildOldIndex(): Map<string, OldEntry> {
  const bySlug = new Map<string, OldEntry>();
  for (const path of walkJson(VAULT_MONSTERS)) {
    const data = readJson(path);
    if (!data || String(data.source ?? '') !== 'srd-2024') continue;
    const handle = slugify(String(data.name_en ?? '') || String(data.index ?? ''));
    if (!handle) {
      console.warn(`  ⚠ ${path}: srd-2024 ohne name_en/index — kein Deutsch-Erhalt möglich.`);
      continue;
    }
    if (bySlug.has(handle)) console.warn(`  ⚠ doppelter Handle "${handle}" (${path}) — letzter gewinnt`);
    bySlug.set(handle, {
      name: String(data.name ?? ''),
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      germanTexts: germanEntries(data),
      path,
    });
  }
  return bySlug;
}

function writeJson(path: string, data: unknown): void {
  if (DRY_RUN) return;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const raw = (await fetchPaginated(OPEN5E_CREATURES)).filter(
    (r) => (r.document as { key?: string } | undefined)?.key === 'srd-2024',
  );
  console.log(`Open5e: ${raw.length} srd-2024-Kreaturen geladen.`);

  const oldBySlug = buildOldIndex();
  console.log(`Vault: ${oldBySlug.size} bestehende SRD-Monster (Dateiname und Tags).`);

  const monsters = raw.map((rec) => mapOpen5eCreature(rec));
  const germanRecords = loadGermanCreatures();
  const germanByMonster = matchGermanCreatures(monsters, germanRecords);
  console.log(`Deutsches SRD: ${germanByMonster.size} von ${monsters.length} Kreaturen zugeordnet (${germanRecords.length} Statblöcke).`);

  const written = new Set<string>();
  const lostTexts: string[] = [];
  const renamed: string[] = [];
  const germanNotes: string[] = [];
  let created = 0;
  let updated = 0;
  let relocated = 0;

  for (const monster of monsters) {
    const slug = keySlug(monster.key) || slugify(monster.name_en);
    const match = oldBySlug.get(slug);
    const german = germanByMonster.get(monster);

    if (german) {
      const notes = applyGermanText(monster, german);
      if (notes.length) germanNotes.push(`${monster.name} (S. ${german.page}):\n    ${notes.join('\n    ')}`);
      // Der bisherige Vault-Name war handgepflegt; ab jetzt gilt der offizielle deutsche.
      if (match?.name && match.name !== monster.name) renamed.push(`${match.name} → ${monster.name}`);
    } else {
      lostTexts.push(`${monster.name_en}: kein deutscher Statblock gefunden`);
      if (match?.name) monster.name = match.name;
      if (match?.germanTexts.length) {
        lostTexts.push(`  ↳ deutsche Texte aus ${match.path} fallen weg: ${match.germanTexts.join(', ')}`);
      }
    }
    if (match) monster.tags = match.tags;

    const parsed = parseMonster(monster);
    if (!parsed.ok) {
      console.error(`✗ Ungültiges Monster "${monster.name}" (${monster.key}):\n  ${parsed.errors.join('\n  ')}`);
      process.exit(1);
    }

    const targetDir = join(VAULT_MONSTERS, MONSTER_TYPE_DIR[monster.type]);
    const targetPath = join(targetDir, match ? basename(match.path) : `${slug}.json`);

    // Zwei Datensätze auf dieselbe Datei = stiller Datenverlust → laut abbrechen.
    if (written.has(targetPath)) {
      console.error(`✗ Namenskollision: "${monster.name}" (${monster.key}) → ${targetPath} bereits geschrieben.`);
      process.exit(1);
    }
    // Fremde Datei am Zielpfad: eigenes Material darf der Import nie überschreiben.
    if (targetPath !== match?.path && existsSync(targetPath)) {
      const other = readJson(targetPath);
      console.error(
        `✗ ${targetPath} existiert schon als „${other?.name ?? '?'}" (source: ${other?.source ?? '?'}) ` +
          `und ist nicht der Bestandstreffer von "${monster.name}". Abgebrochen.`,
      );
      process.exit(1);
    }

    if (!DRY_RUN) mkdirSync(targetDir, { recursive: true });
    writeJson(targetPath, monster);
    written.add(targetPath);

    if (match) {
      updated++;
      if (match.path !== targetPath) {
        relocated++;
        if (!DRY_RUN) rmSync(match.path, { force: true });
        console.log(`  ↦ ${monster.name}: ${match.path} → ${targetPath}`);
      }
    } else {
      created++;
    }
  }

  if (renamed.length) {
    console.log(`\nDeutsche Namen, die das SRD anders schreibt als der Bestand:`);
    for (const line of renamed) console.log(`  • ${line}`);
  }
  if (germanNotes.length) {
    console.log(`\nNicht übertragene oder ergänzte Einträge:`);
    for (const line of germanNotes) console.log(`  • ${line}`);
  }
  if (lostTexts.length) {
    console.log(`\nOhne deutschen SRD-Text — bleibt englisch:`);
    for (const line of lostTexts) console.log(`  • ${line}`);
  }
  console.log(
    `\n${DRY_RUN ? '(dry run) ' : ''}Fertig: ${created} neu, ${updated} aktualisiert ` +
      `(davon ${relocated} verschoben). Homebrew und akt-lokale Monster unangetastet.`,
  );
}

await main();
