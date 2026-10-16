// node post.mjs <figur> — trägt die Befunde aus review/<figur>.json als Vorschläge in die Werkbank ein
import { readFileSync } from 'node:fs';
const fig = process.argv[2];
const found = JSON.parse(readFileSync(new URL(`./${fig}.json`, import.meta.url), 'utf8'));
const base = 'http://localhost:8898';
const M = await (await fetch(`${base}/manifest.json`)).json();
const redo = await (await fetch(`${base}/redo.json`)).json();
const LOOK = { feminine: 'feminin', androgynous: 'neutral', masculine: 'maskulin' };
const i = fig.lastIndexOf('-');
const figDe = `${M.species.find((s) => s.slug === fig.slice(0, i))?.de ?? fig} · ${LOOK[fig.slice(i + 1)]}`;
let n = 0;
for (const f of found) {
  const kind = M.classes.some((c) => c.slug === f.role) ? 'classes' : 'backgrounds';
  const url = `/static/art/figures/${fig}/${kind}/${f.role}.avif`;
  if (redo.some((r) => r.url === url)) continue;
  const roleDe = (kind === 'classes' ? M.classes : M.backgrounds).find((x) => x.slug === f.role)?.de ?? f.role;
  await fetch(`${base}/redo.json`, { method: 'POST', body: JSON.stringify({ add: { url, caption: `${figDe} – ${roleDe}`, note: f.note, by: 'claude', at: new Date().toISOString() } }) });
  n++;
}
console.log(`${fig}: ${n} Vorschläge eingetragen (${found.length} Befunde)`);
