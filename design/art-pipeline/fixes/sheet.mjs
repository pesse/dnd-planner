// node sheet.mjs <blatt.png> [nr…] — Vorher/Nachher je Bild nebeneinander, rote Marke an der Klickstelle; ohne nr alle mit Status [~]
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const sharp = createRequire(join(HERE, '../sharp/package.json'))('sharp');
const LINE = /^- \[(.)\] (\d{3}) \S+ · (\S+) · ([\d.]+)\/([\d.]+) · /;
const [dst, ...nrs] = process.argv.slice(2);
const items = readFileSync(join(HERE, 'todo.md'), 'utf8').split('\n').map((l) => LINE.exec(l)).filter(Boolean)
  .map((m) => ({ status: m[1], nr: m[2], path: m[3], x: +m[4], y: +m[5] }))
  .filter((it) => (nrs.length ? nrs.includes(it.nr) : it.status === '~'));

const W = 300, H = 450, GAP = 12, COLS = 2, LABEL = 22;
const cellW = 2 * W + GAP, cellH = H + LABEL;
const rows = Math.ceil(items.length / COLS);
const tile = (file) => sharp(file).resize(W, H, { fit: 'contain', background: '#333' }).flatten({ background: '#333' }).png().toBuffer();
const svg = (s, w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${s}</svg>`);

const layers = [];
for (const [i, it] of items.entries()) {
  const x0 = (i % COLS) * (cellW + 3 * GAP), y0 = Math.floor(i / COLS) * (cellH + GAP);
  const old = join(ROOT, 'design/art/fixes/old', `${it.nr}.avif`);
  const cur = join(ROOT, 'vault/art', `${it.path}.avif`);
  layers.push({ input: svg(`<text x="2" y="16" font-size="15" font-family="sans-serif" fill="#fff">${it.nr} ${it.path}</text>`, cellW, LABEL), left: x0, top: y0 });
  if (existsSync(old)) layers.push({ input: await tile(old), left: x0, top: y0 + LABEL });
  layers.push({ input: await tile(cur), left: x0 + W + GAP, top: y0 + LABEL });
  const mx = Math.round((it.x / 100) * W), my = Math.round((it.y / 100) * H);
  layers.push({ input: svg(`<circle cx="${mx}" cy="${my}" r="14" fill="none" stroke="red" stroke-width="3"/>`, W, H), left: x0, top: y0 + LABEL });
}
await sharp({ create: { width: COLS * (cellW + 3 * GAP), height: Math.max(rows, 1) * (cellH + GAP), channels: 3, background: '#111' } })
  .composite(layers).png().toFile(dst);
console.log(`${items.length} Bilder → ${dst}`);
