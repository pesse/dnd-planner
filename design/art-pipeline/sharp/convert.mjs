// node convert.mjs <png> <avif> [flip]  — 640x960 AVIF q55 wie die übrige Serie, auf Wunsch gespiegelt
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
const [src, dst, flip] = process.argv.slice(2);
mkdirSync(dirname(dst), { recursive: true });
await sharp(src).flop(flip === 'flip').resize(640, 960).avif({ quality: 55, effort: 5 }).toFile(dst);
