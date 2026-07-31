/**
 * Generiert JE Zod-Schema ein Beispiel-Objekt nach `src/lib/schemas/exampleObjects/`.
 *
 * Die Zod-Schemas bleiben die Single Source of Truth — die JSONs sind nur eine
 * abgeleitete, scannbare Sicht auf die Form (Schlüssel, Verschachtelung, Typ). Sie
 * stehen bewusst NEBEN den Schema-Dateien statt als Kommentarblock darin: so kostet
 * sie nur, wer sie liest.
 *
 * Werte sind Platzhalter, aber gültig: `.default()` wenn aussagekräftig, sonst
 * "string" / 0 / false, Enums der erste Wert. Jedes erzeugte Beispiel wird gegen sein
 * Schema geparst — schlägt das fehl, ist der Generator (oder das Schema) kaputt.
 *
 *   npm run schema:examples            # schreibt/aktualisiert die JSONs
 *   npm run schema:examples:check      # exit 1, wenn ein JSON veraltet ist (CI/Gate)
 *
 * Läuft in WSL: lädt die TS-Schemas über eine minimale Vite-Instanz (configFile:false,
 * ohne SvelteKit-Plugins) — kein tsx/vitest nötig.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_DIR = join(ROOT, 'src/lib/schemas');
const OUT_DIR = join(SCHEMA_DIR, 'exampleObjects');
const CHECK = process.argv.includes('--check');

// ── JSON-Schema-Knoten → Beispielwert ────────────────────────────────────────
function unionBranches(node) {
  const branches = node?.anyOf || node?.oneOf;
  if (!Array.isArray(branches)) return null;
  const objects = branches.filter((b) => b?.type === 'object' && b.properties);
  return objects.length > 1 ? objects : null;
}

/** `top`: nur die äußerste Ebene fächert eine Objekt-Union in alle Varianten auf. */
function example(node, top = false) {
  if (!node || typeof node !== 'object') return null;
  if (node.const !== undefined) return node.const;
  if (Array.isArray(node.enum)) return node.default ?? node.enum[0];

  const branches = node.anyOf || node.oneOf;
  if (Array.isArray(branches)) {
    const objects = unionBranches(node);
    if (objects && top) return objects.map((b) => example(b));
    // Sonst die erste sinnvolle Variante — `anyOf: [X, null]` ist auch nur X.
    return example(objects?.[0] ?? branches.find((b) => b?.type !== 'null') ?? branches[0]);
  }

  const type = Array.isArray(node.type) ? node.type.find((t) => t !== 'null') : node.type;

  if (type === 'object') {
    if (node.properties) {
      return Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, example(v)]));
    }
    // z.record(): ein Beispiel-Eintrag zeigt die Wertform, der Schlüssel ist frei.
    const values = node.additionalProperties;
    return values && typeof values === 'object' ? { '<key>': example(values) } : (node.default ?? {});
  }

  if (type === 'array') {
    // Array einer Objekt-Union: alle Varianten als Elemente — vollständig UND gültig.
    const objects = unionBranches(node.items);
    return objects ? objects.map((b) => example(b)) : [example(node.items)];
  }

  // Grenzen respektieren, sonst fällt das Beispiel durchs eigene Schema (z.B. `min(1)`).
  if (type === 'string') {
    const value = node.default || 'string';
    return node.maxLength !== undefined && value.length > node.maxLength ? value.slice(0, node.maxLength) : value;
  }
  if (type === 'integer' || type === 'number') {
    if (node.default !== undefined) return node.default;
    const min = node.minimum ?? (node.exclusiveMinimum !== undefined ? node.exclusiveMinimum + 1 : undefined);
    return min ?? (node.maximum !== undefined && node.maximum < 0 ? node.maximum : 0);
  }
  if (type === 'boolean') return node.default ?? false;
  return node.default ?? null;
}

/** `featSchema` → `feat.json`; alles ohne `Schema`-Suffix behält seinen Namen. */
function fileNameFor(exportName) {
  return exportName.replace(/Schema$/, '') + '.json';
}

const README = `# exampleObjects

Generiert aus den Zod-Schemas — \`npm run schema:examples\`. **Nicht von Hand editieren**,
Änderungen gehen beim nächsten Lauf verloren; \`npm run schema:examples:check\` meldet
veraltete Dateien.

Ein Beispiel-Objekt je exportiertem Schema (\`featSchema\` → \`feat.json\`), als scannbare
Sicht auf die Form. Die Werte sind gültige Platzhalter, keine echten Inhalte: Defaults wo
aussagekräftig, sonst \`"string"\` / \`0\` / \`false\`, bei Enums der erste Wert. Arrays zeigen
ein Element, \`z.record()\` einen \`<key>\`-Eintrag, Unions alle Varianten.
`;

// ── Main ─────────────────────────────────────────────────────────────────────
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
});
const { z } = await server.ssrLoadModule('zod');

const files = readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith('.ts'))
  .sort();

/** @type {Map<string, {json: string, from: string}>} */
const wanted = new Map();

for (const file of files) {
  const source = readFileSync(join(SCHEMA_DIR, file), 'utf8');
  const mod = await server.ssrLoadModule('/src/lib/schemas/' + file);

  const exported = [...source.matchAll(/export const (\w+)\s*=/g)].map((m) => m[1]);
  for (const name of exported) {
    const schema = mod[name];
    if (typeof schema?.safeParse !== 'function') continue;

    const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
    const value = example(json, true);

    // Selbsttest: das Beispiel MUSS durchs eigene Schema gehen (Union → je Variante).
    for (const candidate of unionBranches(json) ? value : [value]) {
      const result = schema.safeParse(candidate);
      if (!result.success) {
        console.warn(`⚠ ${name} (${file}): Beispiel validiert nicht — ${result.error.issues[0]?.message}`);
      }
    }

    const target = fileNameFor(name);
    const clash = wanted.get(target);
    if (clash) throw new Error(`Namenskollision: ${name} (${file}) und ${clash.from} → ${target}`);
    wanted.set(target, { json: JSON.stringify(value, null, 2) + '\n', from: `${name} (${file})` });
  }
}

await server.close();

if (wanted.size === 0) throw new Error('Kein Schema gefunden — Laden der Module fehlgeschlagen?');

const existing = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')) : [];
const orphans = existing.filter((f) => !wanted.has(f));

let stale = 0;
let written = 0;

if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });

for (const [name, { json }] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
  const path = join(OUT_DIR, name);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === json) continue;
  if (CHECK) {
    stale++;
    console.error(`✗ ${current === null ? 'fehlt' : 'veraltet'}: exampleObjects/${name}`);
  } else {
    writeFileSync(path, json);
    written++;
    console.log(`✓ ${name}`);
  }
}

for (const name of orphans) {
  if (CHECK) {
    stale++;
    console.error(`✗ verwaist: exampleObjects/${name}`);
  } else {
    rmSync(join(OUT_DIR, name));
    console.log(`✗ entfernt: ${name}`);
  }
}

const readmePath = join(OUT_DIR, 'README.md');
if (!CHECK && (!existsSync(readmePath) || readFileSync(readmePath, 'utf8') !== README)) {
  writeFileSync(readmePath, README);
}

if (CHECK) {
  if (stale > 0) {
    console.error(`\n${stale} Datei(en) veraltet — bitte \`npm run schema:examples\` laufen lassen.`);
    process.exit(1);
  }
  console.log(`Aktuell: ${wanted.size} Beispiel-Objekt(e).`);
} else {
  console.log(`\nFertig: ${written} von ${wanted.size} Datei(en) aktualisiert.`);
}
