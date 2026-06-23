// Einmalige Migration: verschiebt Monster-JSONs in Creature-Type-Unterordner.
// Dry-Run (Default) zeigt nur die Aktionen. Mit `--apply` werden sie ausgeführt.
// Bei Namenskollision (gleiche Zieldatei) gewinnt die zuletzt geänderte Datei;
// die älteren Duplikate werden gelöscht. Leere Quellordner werden entfernt.
import { readdirSync, readFileSync, mkdirSync, renameSync, rmSync, statSync, existsSync, rmdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const ROOT = 'vault/monsters';
const TYPE_DIR = {
  aberration: 'aberrationen', beast: 'tiere', celestial: 'himmlische', construct: 'konstrukte',
  dragon: 'drachen', elemental: 'elementare', fey: 'feen', fiend: 'teuflische',
  giant: 'riesen', humanoid: 'humanoide', monstrosity: 'ungeheuer', ooze: 'schleime',
  plant: 'pflanzen', undead: 'untote',
};
const apply = process.argv.includes('--apply');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.json')) out.push(p);
  }
  return out;
}

// Pro Zielpfad sammeln, um Kollisionen zu erkennen.
const byTarget = new Map();
const skipped = [];
for (const path of walk(ROOT)) {
  let type;
  try { type = JSON.parse(readFileSync(path, 'utf8')).type; }
  catch { skipped.push(`${path} (JSON-Fehler)`); continue; }
  const dir = TYPE_DIR[type];
  if (!dir) { skipped.push(`${path} (unbekannter type: ${type})`); continue; }
  const target = join(ROOT, dir, basename(path));
  if (target === path) continue; // schon am richtigen Ort
  if (!byTarget.has(target)) byTarget.set(target, []);
  byTarget.get(target).push({ path, mtime: statSync(path).mtimeMs });
}

const moves = [];
const deletes = [];
for (const [target, sources] of byTarget) {
  sources.sort((a, b) => b.mtime - a.mtime); // neueste zuerst
  moves.push([sources[0].path, target]);
  for (const loser of sources.slice(1)) deletes.push(loser.path);
}

console.log(`\n${moves.length} Move(s):\n`);
for (const [from, to] of moves) console.log(`  ${from}  →  ${to}`);
if (deletes.length) {
  console.log(`\n${deletes.length} ältere(s) Duplikat(e) werden GELÖSCHT:`);
  for (const d of deletes) console.log(`  ✗ ${d}`);
}
if (skipped.length) {
  console.log(`\nÜbersprungen:`);
  for (const s of skipped) console.log(`  ${s}`);
}

if (apply) {
  for (const d of deletes) rmSync(d);
  for (const [from, to] of moves) { mkdirSync(dirname(to), { recursive: true }); renameSync(from, to); }
  // Leere Quellordner (z.B. goblinoide) entfernen
  for (const e of readdirSync(ROOT)) {
    const p = join(ROOT, e);
    if (statSync(p).isDirectory() && readdirSync(p).length === 0) rmdirSync(p);
  }
  console.log(`\n✓ ${moves.length} verschoben, ${deletes.length} gelöscht.`);
} else {
  console.log(`\n(Dry-Run — mit "--apply" ausführen.)`);
}
