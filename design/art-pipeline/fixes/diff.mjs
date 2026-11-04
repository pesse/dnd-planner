// node diff.mjs — stärkste lokale Abweichung alt/neu je [~]-Bild, aufsteigend; kleine Werte = Codex hat kaum etwas geändert
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const sharp = createRequire(join(HERE, '../sharp/package.json'))('sharp');
const LINE = /^- \[~\] (\d{3}) \S+ · (\S+) · /;
const items = readFileSync(join(HERE, 'todo.md'), 'utf8').split('\n').map((l) => LINE.exec(l)).filter(Boolean);
const px = (f) => sharp(f).resize(32, 48, { fit: 'fill' }).flatten({ background: '#808080' }).raw().toBuffer();

const rows = [];
for (const [, nr, path] of items) {
  const [a, b] = await Promise.all([px(join(ROOT, 'design/art/fixes/old', `${nr}.avif`)), px(join(ROOT, 'vault/art', `${path}.avif`))]);
  let max = 0;
  for (let i = 0; i < a.length; i += 3) max = Math.max(max, (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3);
  rows.push({ nr, path, max: Math.round(max) });
}
for (const r of rows.sort((x, y) => x.max - y.max)) console.log(`${r.nr}\t${r.max}\t${r.path}`);
