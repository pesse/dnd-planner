/**
 * Importiert die srd-2024-Gegenstände aus Open5e v2 in die Vault-Bibliothek
 * `vault/items/` — sowohl **Ausrüstung** (`/v2/items/`) als auch **magische
 * Gegenstände** (`/v2/magicitems/`). Beide Endpunkte liefern dasselbe
 * Datensatz-Schema (inline weapon/armor + optional rarity/attunement), der reine
 * `mapOpen5eItem` bildet beide ab.
 *
 * Ablauf:
 *   1. `/v2/items/?document=srd-2024` UND `/v2/magicitems/?document=srd-2024`
 *      paginiert holen, je Datensatz über `mapOpen5eItem` (aus open5eApi.ts)
 *      auf unser Item-Schema abbilden.
 *   2. Deutsch-Erhalt-Index über `vault/items/**` aufbauen: bestehende srd-2024-
 *      Dateien liefern `name_de`/`desc_de` (Match per englischem Namen); Homebrew
 *      bleibt UNANGETASTET. (Magie ist bei Open5e englisch — für die 757 neuen
 *      Magic Items gibt es kein Deutsch außer bereits gepflegten SRD-Dateien wie
 *      „Ring of Protection".)
 *   3. Für jedes importierte Item das Deutsch übernehmen, in den Kategorie-Ordner
 *      schreiben und die alte Datei bei Ordnerwechsel (z.B. armor/→shield/) löschen.
 *
 * **Kein Overlap-Dedup nötig:** die srd-2024-Keys/Namen der beiden Endpunkte
 * kollidieren nicht (verifiziert). Die 11 „magie-nahen" Einträge aus `/v2/items/`
 * (Trank der Heilung, Zauberschriftrolle, Ioun-Stein …) sind bei Open5e srd-2024
 * NICHT in `/v2/magicitems/` enthalten und bleiben daher (mangels Quelle)
 * rarity-los — eine Open5e-Datenlücke, die wir nicht aus srd-2014 auffüllen.
 *
 * **Gate:** jedes gemappte Item muss `parseItem` bestehen, sonst bricht der Lauf ab.
 *
 * Lauf (TypeScript → über esbuild gebündelt):
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/import-open5e-items.mts --outfile=/tmp/import-items.mjs \
 *   && node /tmp/import-items.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { mapOpen5eItem } from '$lib/services/open5eItemMapper';
import { parseItem } from '$lib/utils/schemaValidation';
import type { Item } from '$lib/schemas/item';

const DRY_RUN = process.argv.includes('--dry-run');
const VAULT_ITEMS = 'vault/items';
// Quellen-Filter ist `document=<key>` (NICHT `document__key`, das wird ignoriert).
const OPEN5E_ITEMS = 'https://api.open5e.com/v2/items/?document=srd-2024&limit=500&format=json';
const OPEN5E_MAGIC = 'https://api.open5e.com/v2/magicitems/?document=srd-2024&limit=500&format=json';

const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── 1. Open5e paginiert holen ─────────────────────────────────────────────────
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

async function fetchAllItems(): Promise<Record<string, unknown>[]> {
  const [gear, magic] = await Promise.all([fetchPaginated(OPEN5E_ITEMS), fetchPaginated(OPEN5E_MAGIC)]);
  console.log(`Open5e: ${gear.length} Ausrüstung + ${magic.length} Magie geladen.`);
  // Sicherheitsnetz: nur srd-2024 (der Filter läuft serverseitig, aber doppelt hält besser).
  return [...gear, ...magic].filter((r) => (r.document as { key?: string } | undefined)?.key === 'srd-2024');
}

// ── 2. Deutsch-Erhalt-Index + alte Pfade ───────────────────────────────────────
interface OldEntry {
  name_de?: string;
  desc_de?: string[];
  /** Handgepflegt: Open5e kennt das Feld nicht, der Re-Import darf es trotzdem nicht verlieren. */
  grantsResource?: unknown;
  path: string;
  source: string;
}

/** Alle JSON-Dateien unter vault/items rekursiv. */
function walkItemFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkItemFiles(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function buildOldIndex(): Map<string, OldEntry> {
  const byName = new Map<string, OldEntry>();
  for (const path of walkItemFiles(VAULT_ITEMS)) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    const source = String(data.source ?? '');
    const name = String(data.name ?? '');
    if (source !== 'srd-2024' || !name) continue; // nur SRD-Einträge liefern Deutsch/Alt-Pfad
    const key = name.toLowerCase();
    if (byName.has(key)) console.warn(`  ⚠ doppelter SRD-Name "${name}" (${path}) — letzter gewinnt`);
    byName.set(key, {
      name_de: typeof data.name_de === 'string' ? data.name_de : undefined,
      desc_de: Array.isArray(data.desc_de) ? (data.desc_de as string[]) : undefined,
      grantsResource: data.grantsResource,
      path,
      source,
    });
  }
  return byName;
}

// ── 3. Schreiben ───────────────────────────────────────────────────────────────
function writeJson(path: string, data: unknown): void {
  if (DRY_RUN) return;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const raw = await fetchAllItems();
  console.log(`Open5e: ${raw.length} srd-2024-Datensätze (Ausrüstung + Magie) nach Filter.`);

  const oldByName = buildOldIndex();
  console.log(`Vault: ${oldByName.size} bestehende SRD-Einträge (Deutsch-Quelle).`);

  const written = new Set<string>();
  let created = 0;
  let updated = 0;
  let relocated = 0;
  let withMastery = 0;

  for (const rec of raw) {
    const item: Item = mapOpen5eItem(rec);

    // Gate: muss valide sein, sonst Abbruch.
    const parsed = parseItem(item);
    if (!parsed.ok) {
      console.error(`✗ Ungültiges Item "${item.name}" (${item.key}):\n  ${parsed.errors.join('\n  ')}`);
      process.exit(1);
    }

    const match = oldByName.get(item.name.toLowerCase());
    if (match?.name_de) item.name_de = match.name_de;
    if (match?.desc_de?.length) item.desc_de = match.desc_de;
    if (match?.grantsResource) item.grantsResource = match.grantsResource as Item['grantsResource'];
    if (item.mastery) withMastery++;

    const folder = item.equipment_category.index;
    const filename = match ? basename(match.path) : `${slugify(item.name)}.json`;
    const targetDir = join(VAULT_ITEMS, folder);
    const targetPath = join(targetDir, filename);

    // Zwei Datensätze auf dieselbe Datei = stiller Datenverlust → laut abbrechen.
    if (written.has(targetPath)) {
      console.error(`✗ Namenskollision: "${item.name}" (${item.key}) → ${targetPath} bereits geschrieben.`);
      process.exit(1);
    }

    if (!DRY_RUN) mkdirSync(targetDir, { recursive: true });
    writeJson(targetPath, item);
    written.add(targetPath);

    if (match) {
      updated++;
      if (match.path !== targetPath) {
        relocated++;
        if (!DRY_RUN) rmSync(match.path, { force: true });
        console.log(`  ↦ ${item.name}: ${match.path} → ${targetPath}`);
      }
    } else {
      created++;
    }
  }

  console.log(
    `\n${DRY_RUN ? '(dry run) ' : ''}Fertig: ${created} neu, ${updated} aktualisiert ` +
      `(davon ${relocated} verschoben), ${withMastery} mit Meisterschaft. Homebrew unangetastet.`,
  );
}

await main();
