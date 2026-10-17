// node subsheet.mjs <zielordner> [slug,slug] [figur,figur] — je Subklasse ein JPG mit den Figuren (sonst Prüffiguren) nebeneinander
import sharp from 'sharp';
import { SCENES, PARTS, PROBE_FIGURES } from '../variants/subclasses/scenes.mjs';
const [out, only, figs] = process.argv.slice(2);
const figures = figs ? figs.split(',') : PROBE_FIGURES;
const partOf = (s) => Object.entries(PARTS).find(([, l]) => l.includes(s))[0];
for (const slug of only && only !== 'all' ? only.split(',') : Object.keys(SCENES)) {
  const tiles = await Promise.all(figures.map((f) => sharp(`/mnt/c/dev/privat/dnd-planner/design/art/figures-sub/${f}-${partOf(slug)}/${slug}.png`).resize(400, 600).toBuffer()));
  await sharp({ create: { width: 400 * tiles.length, height: 600, channels: 3, background: '#fff' } })
    .composite(tiles.map((input, i) => ({ input, left: i * 400, top: 0 }))).jpeg({ quality: 82 }).toFile(`${out}/${slug}.jpg`);
}
