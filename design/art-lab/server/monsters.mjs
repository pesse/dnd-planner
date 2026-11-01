// Monster-Szenen für die Werkbank: Reihenfolge und Brief aus der Pipeline, Name und Typ aus dem Vault.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCENES = 'design/art-pipeline/monster-scenes/scenes.tsv';

function vaultMonsters(root) {
  const out = {};
  const base = join(root, 'vault/monsters');
  if (!existsSync(base)) return out;
  for (const dir of readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(join(base, dir.name)).filter((n) => n.endsWith('.json'))) {
      try {
        const j = JSON.parse(readFileSync(join(base, dir.name, f), 'utf8'));
        const slug = typeof j.key === 'string' ? j.key.slice(j.key.indexOf('_') + 1) : f.slice(0, -5);
        out[slug] = { de: j.name ?? slug, type: dir.name, source: j.source ?? '', cr: j.challenge_rating ?? null };
      } catch { /* kaputte Datei: Monster erscheint nur mit englischem Namen */ }
    }
  }
  return out;
}

/** `image(rel)` liefert die versionierte URL oder null, wenn die Datei fehlt. */
export function monsterManifest(root, image) {
  if (!existsSync(join(root, SCENES))) return [];
  const vault = vaultMonsters(root);
  const oldDir = 'design/art/monster-scenes/old';
  const old = existsSync(join(root, oldDir)) ? readdirSync(join(root, oldDir)).filter((f) => f.endsWith('.png')) : [];
  return readFileSync(join(root, SCENES), 'utf8').trim().split('\n').map((line, order) => {
    const [slug, en, brief] = line.split('\t');
    const v = vault[slug] ?? { de: en, type: '', source: '', cr: null };
    return {
      slug, en, brief, order, ...v,
      scene: image(`vault/art/monster-scenes/${slug}.avif`),
      icon: image(`vault/art/monsters/${slug}.avif`),
      old: old.filter((f) => f.startsWith(`${slug}--`)).sort().map((f) => image(`${oldDir}/${f}`)),
    };
  });
}
