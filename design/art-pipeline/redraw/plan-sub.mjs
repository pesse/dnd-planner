// node plan-sub.mjs [--apply] — offene Markierungen an Subklassen-Bildern → fixes/<fig>-<part>.tsv + jobs-sub.txt
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { PARTS } from '../variants/subclasses/scenes.mjs';
const ROOT = '/mnt/c/dev/privat/dnd-planner';
const partOf = (slug) => Object.keys(PARTS).find((p) => PARTS[p].includes(slug));
const redo = JSON.parse(readFileSync(`${ROOT}/design/art/figures/redo.json`, 'utf8'));
const open = redo.filter((r) => !r.dismissed && (r.by !== 'claude' || r.confirmed) && !r.redrawn);
const groups = new Map();
const skipped = [];
for (const r of open) {
  const m = r.url.match(/^\/static\/art\/figures\/([a-z]+-[a-z]+)\/subclasses\/([a-z-]+)\.avif$/);
  if (!m) continue;
  const [, fig, slug] = m;
  const part = partOf(slug);
  if (!part) { skipped.push(`${r.url} (Subklasse ohne Szene)`); continue; }
  const png = `${ROOT}/design/art/figures-sub/${fig}-${part}/${slug}.png`;
  if (existsSync(png) && r.at && statSync(png).mtime > new Date(r.at)) { skipped.push(`${r.url} (Bild neuer als Markierung)`); continue; }
  const key = `${fig}-${part}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ slug, note: (r.note ?? '').replace(/\s+/g, ' ').trim(), url: r.url });
}
const here = new URL('.', import.meta.url).pathname;
const apply = process.argv.includes('--apply');
const jobs = [];
for (const [key, list] of groups) {
  jobs.push(`${key.slice(0, -3)} ${key.slice(-2)}`);
  if (apply) {
    mkdirSync(`${here}fixes`, { recursive: true });
    writeFileSync(`${here}fixes/${key}.tsv`, list.map((x) => `${x.slug}\t${x.note}`).join('\n') + '\n');
  }
}
console.log(`${[...groups.values()].flat().length} Bilder in ${jobs.length} Läufen; übersprungen: ${skipped.length}`);
skipped.forEach((s) => console.log('  - ' + s));
if (apply) {
  writeFileSync(`${here}jobs-sub.txt`, jobs.join('\n') + '\n');
  const urls = [...groups.values()].flat().map((x) => x.url);
  const res = await fetch('http://localhost:8898/redo.json', { method: 'POST', body: JSON.stringify({ plan: urls }) }).catch(() => null);
  console.log(res?.ok ? `${urls.length} als eingeplant markiert` : 'Werkbank nicht erreichbar');
}
