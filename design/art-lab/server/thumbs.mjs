// Vorschaubilder für die Werkbank: volle AVIFs und Roh-PNGs sind für Raster zu schwer zu dekodieren.
import { createRequire } from 'node:module';
import { existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('../../art-pipeline/sharp/node_modules/sharp');
sharp.concurrency(1);

export const THUMB_WIDTHS = [160, 400];
const LIMIT = 4;
let running = 0;
const queue = [];
const pending = new Map();

const slot = () => (running < LIMIT ? Promise.resolve() : new Promise((r) => queue.push(r)));
const release = () => { running--; queue.shift()?.(); };

/** Pfad des Vorschaubilds; erzeugt es, wenn es fehlt oder älter als die Quelle ist. */
export async function thumb(root, rel, width) {
  const src = join(root, rel);
  const dst = join(root, 'design/art/.thumbs', String(width), `${rel}.webp`);
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) return dst;
  if (pending.has(dst)) return pending.get(dst);
  const job = (async () => {
    await slot();
    running++;
    try {
      mkdirSync(dirname(dst), { recursive: true });
      await sharp(src).resize({ width }).webp({ quality: 72 }).toFile(dst);
      return dst;
    } finally { release(); pending.delete(dst); }
  })();
  pending.set(dst, job);
  return job;
}
