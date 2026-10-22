// node brief.mjs <serie> <W> <N> <B> — Auftrag für die nächsten B offenen Motive von Worker W aus N; Exit 3, wenn keins mehr offen ist
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const [serie, W, N, B] = process.argv.slice(2);
const here = new URL('.', import.meta.url).pathname, art = `${here}../../art/`;
const s = JSON.parse(readFileSync(here + 'series.json', 'utf8'))[serie];
const have = new Set([serie, `${serie}-w${W}`].filter((d) => existsSync(art + d))
  .flatMap((d) => readdirSync(art + d)).map((f) => f.replace(/\.png$/, '')));
const open = readFileSync(`${here}motifs/${serie}.tsv`, 'utf8').trim().split('\n').map((l) => l.split('\t'))
  .filter((_, i) => i % +N === +W).filter(([slug]) => !have.has(slug)).slice(0, +B);
if (!open.length) process.exit(3);
const head = readFileSync(here + 'style.md', 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => s[k]);
process.stdout.write(head + open.map(([slug, name, motif]) => `- ${slug}.png — ${name}: ${motif}`).join('\n') + '\n');
