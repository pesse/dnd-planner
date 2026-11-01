// node brief.mjs <W> <N> <B> — Auftrag für die nächsten B offenen Szenen von Worker W aus N; Exit 3, wenn keine mehr offen ist
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const [W, N, B] = process.argv.slice(2);
const here = new URL('.', import.meta.url).pathname, art = `${here}../../art/`;
const have = new Set(['monster-scenes', `monster-scenes-w${W}`].filter((d) => existsSync(art + d))
  .flatMap((d) => readdirSync(art + d)).map((f) => f.replace(/\.png$/, '')));
const open = readFileSync(`${here}scenes.tsv`, 'utf8').trim().split('\n').map((l) => l.split('\t'))
  .filter((_, i) => i % +N === +W).filter(([slug]) => !have.has(slug)).slice(0, +B);
if (!open.length) process.exit(3);
process.stdout.write(readFileSync(here + 'head.md', 'utf8')
  + open.map(([slug, name, brief]) => `- ${slug}.png — ${name}: ${brief}`).join('\n') + '\n');
