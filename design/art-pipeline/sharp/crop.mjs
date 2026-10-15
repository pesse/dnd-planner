// node crop.mjs in.png out.png x y w h  — Ausschnitt (Pixel des Originals), auf 768 px Breite vergrößert
import sharp from 'sharp';
const [inp, out, x, y, w, h] = process.argv.slice(2);
await sharp(inp).extract({ left: +x, top: +y, width: +w, height: +h }).resize({ width: 768 }).toFile(out);
