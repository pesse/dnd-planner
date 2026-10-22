// node iconsheet.mjs <out.png> <ordner> — Übersichtsblatt auf dunklem Grund; meldet Bilder mit deckendem Rand (Alpha fehlt)
import sharp from 'sharp';
import { readdirSync } from 'fs';
const [out, dir] = process.argv.slice(2), T = 128, C = 8;
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
for (const f of files) {
  const { data } = await sharp(`${dir}/${f}`).resize(64, 64).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let edge = 0, n = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (x > 2 && x < 61 && y > 2 && y < 61) continue;
    n++; if (data[(y * 64 + x) * 4 + 3] > 200) edge++;
  }
  if (edge / n > 0.25) console.log(f, `${Math.round((edge / n) * 100)} % deckender Rand`);
}
const tiles = await Promise.all(files.map((f) => sharp(`${dir}/${f}`).resize(T, T).png().toBuffer()));
await sharp({ create: { width: C * T, height: Math.ceil(files.length / C) * T, channels: 3, background: '#3a332c' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % C) * T, top: Math.floor(i / C) * T })))
  .png().toFile(out);
console.log(files.map((f) => f.replace('.png', '')).join(' '));
