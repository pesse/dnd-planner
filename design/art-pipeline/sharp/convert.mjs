// node convert.mjs <png> <avif>  — 640x960 AVIF q55 wie die übrige Serie
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
const [src, dst] = process.argv.slice(2);
mkdirSync(dirname(dst), { recursive: true });
await sharp(src).resize(640, 960).avif({ quality: 55, effort: 5 }).toFile(dst);
