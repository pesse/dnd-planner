// node sheet.mjs out.jpg cols img...  — Übersichtsblatt
import sharp from 'sharp';
const [out, colsS, ...imgs] = process.argv.slice(2);
const cols = +colsS, w = +(process.env.TW ?? 256), h = w * 1.5, rows = Math.ceil(imgs.length / cols);
const tiles = await Promise.all(imgs.map((p) => sharp(p).resize(w, h).toBuffer()));
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#eee' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
  .jpeg({ quality: 82 }).toFile(out);
