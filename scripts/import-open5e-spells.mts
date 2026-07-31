/**
 * Importiert die srd-2024-Zauber aus Open5e v2 in die Vault-Bibliothek
 * `vault/spells/`. Gegenstück zu `import-open5e-items.mts`, mit drei Besonderheiten:
 *
 *   1. Der Quellen-Filter heißt bei Zaubern `document__key=srd-2024` (NICHT
 *      `document=…` — das liefert bei /v2/spells/ ALLE Dokumente).
 *   2. Deutsch-Erhalt läuft umgekehrt zu Items: gematcht wird per `name_en`
 *      (Open5e ist englisch, das Vault trägt das Deutsch als `name`). Übernommen
 *      werden `name` (DE), `desc_de`, `higher_level_de` und die deutschen
 *      casting_time/range/duration (die es nur im Vault gibt).
 *   3. Open5es srd-2024 deckt nur 339 der 406 Vault-Zauber ab. Die 67 ohne Pendant
 *      werden im Abschluss-Pass selbst bekeyt/reklassifiziert (Drei-Wege-Regel):
 *        • unter anderem Open5e-Dokument gefunden (srd-2014/deepm/a5e-ag) →
 *          dessen source/document übernehmen, Key normalisieren;
 *        • sonst & phb-2024 → bleibt phb-2024 (Carve-out, nur key/document setzen);
 *        • sonst → source = dndapi-2014.
 *      Danach trägt JEDER Vault-Zauber key + document.
 *
 * **Gate:** jeder gemappte Zauber muss `parseSpell` bestehen, sonst bricht der Lauf ab.
 *
 * Lauf (TypeScript → über esbuild gebündelt):
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/import-open5e-spells.mts --outfile=/tmp/import-spells.mjs \
 *   && node /tmp/import-spells.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mapOpen5eSpell } from '$lib/services/open5eSpellMapper';
import { parseSpell } from '$lib/utils/schemaValidation';
import type { Spell } from '$lib/schemas/spell';

const DRY_RUN = process.argv.includes('--dry-run');
const VAULT_SPELLS = 'vault/spells';
const OPEN5E_SRD = 'https://api.open5e.com/v2/spells/?document__key=srd-2024&limit=500&format=json';
const OPEN5E_ALL = 'https://api.open5e.com/v2/spells/?limit=2000&format=json';

// school (englisch) → Ordnername (deutsch); identisch zu spellLibrary.ts SPELL_SCHOOL_DIR.
const SCHOOL_DIR: Record<string, string> = {
  abjuration: 'bannmagie', conjuration: 'beschwörung', divination: 'erkenntnismagie',
  enchantment: 'verzauberung', evocation: 'hervorrufung', illusion: 'illusionsmagie',
  necromancy: 'nekromantie', transmutation: 'verwandlung',
};

// Fremd-Dokumente, deren Herkunft wir für die 67 übernehmen dürfen (Priorität in
// dieser Reihenfolge; alles andere zählt als „nicht gefunden").
const ADOPT_DOCS = ['srd-2014', 'deepm', 'a5e-ag'];

const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const lc = (s: unknown): string => String(s ?? '').trim().toLowerCase();

// ── Open5e paginiert holen ──────────────────────────────────────────────────────
async function fetchPaginated(startUrl: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let url: string | null = startUrl;
  while (url) {
    const req = await fetch(url, { headers: { 'User-Agent': 'dnd-planner-import' } });
    const page = (await req.json()) as { results?: Record<string, unknown>[]; next?: string | null };
    out.push(...(page.results ?? []));
    url = page.next ?? null;
  }
  return out;
}

// ── Vault-Index (Deutsch-Quelle + Alt-Pfad), Schlüssel = name_en (lowercase) ─────
interface VaultEntry {
  data: Record<string, unknown>;
  path: string;
  nameEn: string;
}

function walkSpellFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkSpellFiles(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function buildVaultIndex(): Map<string, VaultEntry> {
  const byNameEn = new Map<string, VaultEntry>();
  for (const path of walkSpellFiles(VAULT_SPELLS)) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    const nameEn = lc(data.name_en);
    if (!nameEn) {
      console.warn(`  ⚠ Vault-Zauber ohne name_en: ${path}`);
      continue;
    }
    if (byNameEn.has(nameEn)) console.warn(`  ⚠ doppeltes name_en "${nameEn}" (${path}) — letzter gewinnt`);
    byNameEn.set(nameEn, { data, path, nameEn });
  }
  return byNameEn;
}

// name_en (lowercase) → {docKey, gamesystem, open5eKey} über ADOPT_DOCS, für die 67.
interface AdoptRef {
  docKey: string;
  gamesystem: string;
  open5eKey: string;
}
function buildAdoptIndex(all: Record<string, unknown>[]): Map<string, AdoptRef> {
  const byNameEn = new Map<string, AdoptRef>();
  for (const s of all) {
    const doc = s.document as { key?: string; gamesystem?: { key?: string } } | undefined;
    const docKey = doc?.key ?? '';
    if (!ADOPT_DOCS.includes(docKey)) continue;
    const nameEn = lc(s.name);
    const ref: AdoptRef = { docKey, gamesystem: doc?.gamesystem?.key ?? '', open5eKey: String(s.key ?? '') };
    const cur = byNameEn.get(nameEn);
    // Priorität: früherer Eintrag in ADOPT_DOCS gewinnt (srd-2014 > deepm > a5e-ag).
    if (!cur || ADOPT_DOCS.indexOf(docKey) < ADOPT_DOCS.indexOf(cur.docKey)) byNameEn.set(nameEn, ref);
  }
  return byNameEn;
}

function writeJson(path: string, data: unknown): void {
  if (DRY_RUN) return;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// Deutsch/Alt-Werte aus einer Vault-Datei auf den frisch gemappten Zauber übernehmen.
function preserveGerman(spell: Spell, vault: Record<string, unknown>): void {
  if (typeof vault.name === 'string' && vault.name) spell.name = vault.name;
  if (Array.isArray(vault.desc_de)) spell.desc_de = vault.desc_de as string[];
  if (Array.isArray(vault.higher_level_de)) spell.higher_level_de = vault.higher_level_de as string[];
  if (typeof vault.casting_time === 'string' && vault.casting_time) spell.casting_time = vault.casting_time;
  if (typeof vault.range === 'string' && vault.range) spell.range = vault.range;
  if (typeof vault.duration === 'string' && vault.duration) spell.duration = vault.duration;
  const vComp = vault.components as { materials_needed?: unknown } | undefined;
  if (vComp && typeof vComp.materials_needed === 'string' && vComp.materials_needed) {
    spell.components.materials_needed = vComp.materials_needed;
  }
}

async function main(): Promise<void> {
  const [srd, all] = await Promise.all([fetchPaginated(OPEN5E_SRD), fetchPaginated(OPEN5E_ALL)]);
  const srdFiltered = srd.filter((r) => (r.document as { key?: string } | undefined)?.key === 'srd-2024');
  console.log(`Open5e: ${srdFiltered.length} srd-2024-Zauber, ${all.length} Zauber gesamt.`);

  const vaultIdx = buildVaultIndex();
  const adoptIdx = buildAdoptIndex(all);
  console.log(`Vault: ${vaultIdx.size} bestehende Zauber (Deutsch-Quelle).`);

  const srdNames = new Set(srdFiltered.map((r) => lc(r.name)));
  let created = 0;
  let updated = 0;

  // ── Pass 1: die 339 srd-2024-Zauber aus Open5e ────────────────────────────────
  for (const rec of srdFiltered) {
    const spell: Spell = mapOpen5eSpell(rec);
    const match = vaultIdx.get(lc(spell.name_en));
    if (match) preserveGerman(spell, match.data);

    const parsed = parseSpell(spell);
    if (!parsed.ok) {
      console.error(`✗ Ungültiger Zauber "${spell.name}" (${spell.key}):\n  ${parsed.errors.join('\n  ')}`);
      process.exit(1);
    }

    let targetPath: string;
    if (match) {
      targetPath = match.path; // Ordner + Dateiname des Vault-Eintrags erhalten
      updated++;
    } else {
      const dir = SCHOOL_DIR[spell.school] ?? 'hervorrufung';
      const targetDir = join(VAULT_SPELLS, dir);
      if (!DRY_RUN) mkdirSync(targetDir, { recursive: true });
      targetPath = join(targetDir, `${slugify(spell.name)}.json`);
      created++;
    }
    writeJson(targetPath, spell);
  }

  // ── Pass 2: die 67 ohne srd-2024-Pendant — bekeyen/reklassifizieren ────────────
  let adopted = 0;
  let phbKept = 0;
  let toDndApi = 0;
  for (const entry of vaultIdx.values()) {
    if (srdNames.has(entry.nameEn)) continue; // in Pass 1 behandelt
    const raw = { ...entry.data };
    const nameEn = String(raw.name_en ?? '');
    const curSource = String(raw.source ?? '');

    let source: string;
    let gamesystem: string;
    let index: string;
    const adopt = adoptIdx.get(entry.nameEn);
    if (adopt) {
      source = adopt.docKey;
      gamesystem = adopt.gamesystem;
      index = adopt.open5eKey; // originaler Open5e-Key als index
      adopted++;
    } else if (curSource === 'phb-2024') {
      source = 'phb-2024';
      gamesystem = '5e-2024';
      index = slugify(nameEn);
      phbKept++;
    } else {
      source = 'dndapi-2014';
      gamesystem = '5e-2014';
      index = slugify(nameEn);
      toDndApi++;
    }

    raw.source = source;
    raw.key = `${source}_${slugify(nameEn)}`;
    raw.index = index;
    raw.document = { key: source, gamesystem };

    const parsed = parseSpell(raw);
    if (!parsed.ok) {
      console.error(`✗ Ungültiger reklassifizierter Zauber "${raw.name}" (${raw.key}):\n  ${parsed.errors.join('\n  ')}`);
      process.exit(1);
    }
    writeJson(entry.path, raw);
  }

  console.log(
    `\n${DRY_RUN ? '(dry run) ' : ''}Fertig: Pass 1 — ${updated} aktualisiert, ${created} neu. ` +
      `Pass 2 — ${adopted} Fremd-Doc übernommen, ${phbKept} phb-2024 behalten, ${toDndApi} → dndapi-2014. ` +
      `Alle ${vaultIdx.size} Vault-Zauber tragen jetzt key + document.`,
  );
}

await main();
