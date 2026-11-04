// node zoom.mjs <blatt.png> <nr>… — Ausschnitt um die Klickstelle, vorher | nachher, eine Zeile je Bild
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const sharp = createRequire(join(HERE, '../sharp/package.json'))('sharp');
const LINE = /^- \[.\] (\d{3}) \S+ · (\S+) · ([\d.]+)\/([\d.]+) · /;
const [dst, ...nrs] = process.argv.slice(2);
const items = readFileSync(join(HERE, 'todo.md'), 'utf8').split('\n').map((l) => LINE.exec(l)).filter(Boolean)
  .map((m) => ({ nr: m[1], path: m[2], x: +m[3], y: +m[4] })).filter((it) => nrs.includes(it.nr));

const T = 300, SHARE = 0.4;
async function crop(file, it) {
  const { width, height } = await sharp(file).metadata();
  const size = Math.round(Math.min(width, height) * SHARE);
  const left = Math.min(Math.max(0, Math.round((it.x / 100) * width - size / 2)), width - size);
  const top = Math.min(Math.max(0, Math.round((it.y / 100) * height - size / 2)), height - size);
  return sharp(file).extract({ left, top, width: size, height: size }).resize(T, T).flatten({ background: '#555' }).png().toBuffer();
}
const layers = [];
for (const [i, it] of items.entries()) {
  layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${2 * T}" height="20"><text x="2" y="15" font-size="14" font-family="sans-serif" fill="#fff">${it.nr} ${it.path}</text></svg>`), left: 0, top: i * (T + 26) });
  layers.push({ input: await crop(join(ROOT, 'design/art/fixes/old', `${it.nr}.avif`), it), left: 0, top: i * (T + 26) + 22 });
  layers.push({ input: await crop(join(ROOT, 'vault/art', `${it.path}.avif`), it), left: T + 8, top: i * (T + 26) + 22 });
}
await sharp({ create: { width: 2 * T + 8, height: items.length * (T + 26), channels: 3, background: '#111' } }).composite(layers).png().toFile(dst);
console.log(`${items.length} Ausschnitte → ${dst}`);
