// node convert.mjs <png> <webp>  — 640x960 q80 wie die übrige Serie
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
const [src, dst] = process.argv.slice(2);
mkdirSync(dirname(dst), { recursive: true });
await sharp(src).resize(640, 960).webp({ quality: 80 }).toFile(dst);
