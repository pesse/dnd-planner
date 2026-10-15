// node plan.mjs [--apply] — offene Markierungen → fixes/<fig>-<part>.tsv + jobs.txt, mit --apply als „eingeplant" an die Werkbank
import { readFileSync, writeFileSync, statSync, existsSync, rmSync, mkdirSync } from 'node:fs';
const ROOT = '/mnt/c/dev/privat/dnd-planner';
const PARTS = {
  ca: 'barbarian bard cleric druid fighter monk', cb: 'paladin ranger rogue sorcerer warlock wizard',
  ba: 'acolyte artisan charlatan criminal entertainer farmer guard guide', bb: 'hermit merchant noble sage sailor scribe soldier wayfarer',
};
const partOf = (role) => Object.keys(PARTS).find((p) => PARTS[p].split(' ').includes(role));
const redo = JSON.parse(readFileSync(`${ROOT}/design/art/figures/redo.json`, 'utf8'));
const open = redo.filter((r) => !r.dismissed && (r.by !== 'claude' || r.confirmed) && !r.redrawn); // auch schon Eingeplantes: ein neuer Plan ersetzt fixes/ komplett
const groups = new Map();
const skipped = [];
for (const r of open) {
  const m = r.url.match(/^\/static\/art\/figures\/([a-z]+-[a-z]+)\/(classes|backgrounds)\/([a-z]+)\.webp$/);
  if (!m) { skipped.push(`${r.url} (kein Varianten-Bild)`); continue; }
  if ((process.env.SKIP ?? '').split(',').includes(r.url)) { skipped.push(`${r.url} (zurückgestellt)`); continue; }
  const [, fig, , role] = m;
  const part = partOf(role);
  const png = `${ROOT}/design/art/figures-var2/${fig}-${part}/${role}.png`;
  // Eine Markierung, die älter ist als das Bild, galt einer Vorgängerfassung.
  if (existsSync(png) && r.at && statSync(png).mtime > new Date(r.at)) { skipped.push(`${r.url} (Bild neuer als Markierung)`); continue; }
  const key = `${fig}-${part}`;
  if (!groups.has(key)) groups.set(key, []);
  const note = (r.note ?? '').replace(/\s+/g, ' ').trim();
  groups.get(key).push({ role, note, url: r.url, reroll: /komplett neu|neu machen|neu zeichnen|neu malen|andere szene/i.test(note) });
}
const apply = process.argv.includes('--apply');
if (apply) { rmSync('fixes', { recursive: true, force: true }); mkdirSync('fixes'); }
const jobs = [];
for (const [key, list] of groups) {
  const fig = key.replace(/-(ca|cb|ba|bb)$/, ''), part = key.slice(-2);
  jobs.push(`${fig} ${part}`);
  if (apply) writeFileSync(`fixes/${key}.tsv`, list.map((x) => `${x.role}\t${x.note}${x.reroll ? '\treroll' : ''}`).join('\n') + '\n');
}
console.log(`${open.length - skipped.length} Bilder in ${jobs.length} Läufen; übersprungen: ${skipped.length}`);
skipped.forEach((s) => console.log('  - ' + s));
if (apply) {
  writeFileSync('jobs.txt', jobs.join('\n') + '\n');
  const urls = [...groups.values()].flat().map((x) => x.url);
  const res = await fetch('http://localhost:8898/redo.json', { method: 'POST', body: JSON.stringify({ plan: urls }) });
  console.log(res.ok ? `${urls.length} als eingeplant markiert` : `Werkbank nicht erreichbar (${res.status})`);
}
