// node redrawn.mjs <ordner> — neu gemalte Szenen aus out/notes.tsv streichen und der Werkbank als „neu gemalt“ melden
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname, notesFile = `${here}out/notes.tsv`;
if (!existsSync(notesFile)) process.exit(0);
const LAB = process.env.ARTLAB_URL ?? 'http://localhost:8898';
const done = new Set(readdirSync(process.argv[2]).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
const lines = readFileSync(notesFile, 'utf8').trim().split('\n').filter(Boolean);
const rest = [];
for (const line of lines) {
  const slug = line.split('\t')[0];
  if (!done.has(slug)) { rest.push(line); continue; }
  await fetch(`${LAB}/redo.json`, { method: 'POST', body: JSON.stringify({ redrawn: `/vault/art/monster-scenes/${slug}.avif` }) }).catch(() => {});
}
writeFileSync(notesFile, rest.length ? rest.join('\n') + '\n' : '');
