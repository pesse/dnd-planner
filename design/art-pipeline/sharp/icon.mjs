// node icon.mjs <png> <avif> — Bibliotheks-Icon: 512 × 512 AVIF q55 mit Alpha
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
const [src, dst] = process.argv.slice(2);
mkdirSync(dirname(dst), { recursive: true });
await sharp(src).resize(512, 512).avif({ quality: 55, effort: 5 }).toFile(dst);
