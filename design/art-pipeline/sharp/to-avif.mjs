// node to-avif.mjs [--dry] — vault/art/**/*.webp → .avif (q55), Quelle bevorzugt das Roh-PNG, wenn es nachweislich dasselbe Bild ist
import sharp from 'sharp';
import { readdirSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
const ROOT = '/mnt/c/dev/privat/dnd-planner', STATIC = join(ROOT, 'vault/art'), RAW = join(ROOT, 'design/art');
const PARTS = { ca: 'barbarian bard cleric druid fighter monk', cb: 'paladin ranger rogue sorcerer warlock wizard',
  ba: 'acolyte artisan charlatan criminal entertainer farmer guard guide', bb: 'hermit merchant noble sage sailor scribe soldier wayfarer' };
const dry = process.argv.includes('--dry');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const baseRuns = readdirSync(join(RAW, 'figures-base')).map((r) => join(RAW, 'figures-base', r));

function candidates(webp) {
  const rel = relative(STATIC, webp).split('/'), slug = basename(webp, '.webp');
  if (rel[0] === 'figures') {
    const fig = rel[1];
    if (rel.length === 3) return baseRuns.flatMap((r) => (existsSync(r) ? readdirSync(r) : []).filter((n) => n.startsWith(fig) && n.endsWith('.png')).map((n) => join(r, n)));
    const part = Object.keys(PARTS).find((p) => PARTS[p].split(' ').includes(slug));
    return [join(RAW, 'figures-var2', `${fig}-${part}`, `${slug}.png`)];
  }
  return [join(RAW, rel[0], `${slug}.png`)];
}
const thumb = (src, w, h) => sharp(src).resize(w, h).flatten({ background: '#fff' }).raw().toBuffer();
async function diff(png, webp, w, h) {
  const tw = 32, th = Math.round(32 * h / w);
  const [a, b] = await Promise.all([thumb(png, tw, th), thumb(webp, tw, th)]);
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
async function convert(webp) {
  const { width: w, height: h } = await sharp(webp).metadata();
  let best = null;
  for (const png of candidates(webp).filter((p) => existsSync(p))) {
    const m = await sharp(png).metadata();
    if (Math.abs(m.width / m.height - w / h) > 0.01) continue;
    const d = await diff(png, webp, w, h);
    if (d < 6 && (!best || d < best.d)) best = { png, d };
  }
  const src = best?.png ?? webp;
  if (!dry) { await sharp(src).resize(w, h).avif({ quality: 55, effort: 5 }).toFile(webp.replace(/\.webp$/, '.avif')); unlinkSync(webp); }
  return best ? 'png' : 'webp';
}
const files = walk(STATIC).filter((f) => f.endsWith('.webp'));
const tally = {}; let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < files.length) { const f = files[i++]; const k = `${relative(STATIC, f).split('/')[0]}:${await convert(f)}`; tally[k] = (tally[k] ?? 0) + 1; }
}));
console.log(files.length, tally);
