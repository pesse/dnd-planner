// node redo.mjs [--apply] — in der Werkbank markierte Monster-Szenen zum Neumalen einplanen:
// altes Roh-PNG nach old/, Notiz nach out/notes.tsv (brief.mjs hängt sie an), Werkbank-Status „eingeplant“.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, renameSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname, root = `${here}../../../`;
const raw = `${root}design/art/monster-scenes`, notesFile = `${here}out/notes.tsv`;
const LAB = process.env.ARTLAB_URL ?? 'http://localhost:8898';
const redoFile = `${root}design/art/figures/redo.json`;
const redo = existsSync(redoFile) ? JSON.parse(readFileSync(redoFile, 'utf8')) : [];
const notes = new Map(existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('\t')) : []);
const plan = [], skipped = [];
for (const r of redo.filter((x) => !x.dismissed && (x.by !== 'claude' || x.confirmed) && !x.redrawn && !x.planned)) {
  const slug = r.url.match(/^\/vault\/art\/monster-scenes\/([a-z0-9-]+)\.avif$/)?.[1];
  if (!slug) continue;
  const png = `${raw}/${slug}.png`;
  // Eine Markierung, die älter ist als das Bild, galt einer Vorgängerfassung.
  if (existsSync(png) && r.at && statSync(png).mtime > new Date(r.at)) { skipped.push(`${slug} (Bild neuer als Markierung)`); continue; }
  plan.push({ slug, url: r.url, png, note: (r.note ?? '').replace(/\s+/g, ' ').trim() });
}
console.log(`${plan.length} Monster-Szenen neu malen${skipped.length ? `; übersprungen: ${skipped.join(', ')}` : ''}`);
plan.forEach((p) => console.log(`  - ${p.slug}${p.note ? `: ${p.note}` : ''}`));
if (process.argv.includes('--apply') && plan.length) {
  mkdirSync(`${raw}/old`, { recursive: true });
  mkdirSync(`${here}out`, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  for (const p of plan) {
    if (existsSync(p.png)) renameSync(p.png, `${raw}/old/${p.slug}--${stamp}.png`);
    notes.set(p.slug, p.note);
  }
  writeFileSync(notesFile, [...notes].map((e) => e.join('\t')).join('\n') + '\n');
  const res = await fetch(`${LAB}/redo.json`, { method: 'POST', body: JSON.stringify({ plan: plan.map((p) => p.url) }) }).catch((e) => e);
  console.log(res.ok ? `${plan.length} als eingeplant markiert — jetzt job.sh starten` : `Werkbank nicht erreichbar (${res.status ?? res.message})`);
}
