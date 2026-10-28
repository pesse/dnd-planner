// Werkbank für die Wizard-Stimmungsbilder: `npm run artlab` → http://localhost:8898
// Liest die Bildordner bei jedem Aufruf neu ein — neue Bilder erscheinen mit einem Reload.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8898);
const REDO = join(ROOT, 'design/art/figures/redo.json');
const LOOKS = ['feminine', 'androgynous', 'masculine'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8', '.json': 'application/json' };

const ls = (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)) : []);
const slugsIn = (dir, ext) => ls(dir).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length));

function vaultNames(dir) {
  const out = {};
  for (const slug of slugsIn(`vault/${dir}`, '.json')) {
    try {
      const j = JSON.parse(readFileSync(join(ROOT, 'vault', dir, `${slug}.json`), 'utf8'));
      out[slug] = j.nameDe || j.name || slug;
    } catch { out[slug] = slug; }
  }
  return out;
}

// Änderungszeit je App-Bild: die Werkbank hängt sie an die URL, damit „Aktualisieren“ nur geänderte Bilder neu lädt.
let versions = {};
function versioned(file) {
  const url = `/${file}`;
  versions[url] = Math.round(statSync(join(ROOT, file)).mtimeMs);
  return url;
}

function imageMap(dir) {
  const out = {};
  for (const slug of slugsIn(dir, '.avif')) out[slug] = versioned(`${dir}/${slug}.avif`);
  return out;
}

function manifest() {
  versions = {};
  const speciesDe = vaultNames('species');
  const classDe = vaultNames('classes');
  const backgroundDe = vaultNames('backgrounds');
  // Grundklassen = die mit eigenem Klassenbild; Unterklassen liegen im selben Vault-Ordner.
  const classes = slugsIn('static/art/classes', '.avif');
  // Je Subklasse die Grundklasse als Slug ohne Quellpräfix, sortiert nach Klasse, dann Name.
  const subclasses = slugsIn('vault/classes', '.json').flatMap((slug) => {
    try {
      const of = JSON.parse(readFileSync(join(ROOT, 'vault/classes', `${slug}.json`), 'utf8')).subclassOf;
      return of ? [{ slug, cls: of.replace(/^[^_]*_/, '') }] : [];
    } catch { return []; }
  }).sort((a, b) => a.cls.localeCompare(b.cls) || (classDe[a.slug] ?? a.slug).localeCompare(classDe[b.slug] ?? b.slug, 'de'));

  const figures = {};
  const variantCount = classes.length + Object.keys(backgroundDe).length;
  for (const species of Object.keys(speciesDe)) {
    for (const look of LOOKS) {
      const key = `${species}-${look}`;
      const base = `static/art/figures/${key}`;
      // Bilder der aktuellen Queue (figures-var2) gelten als neu; was dort fehlt, stammt aus älteren Läufen.
      const fresh = [];
      for (const part of ['ca', 'cb', 'ba', 'bb']) {
        const kind = part[0] === 'c' ? 'classes' : 'backgrounds';
        for (const slug of slugsIn(`design/art/figures-var2/${key}-${part}`, '.png')) {
          if (existsSync(join(ROOT, base, kind, `${slug}.avif`))) fresh.push(`/${base}/${kind}/${slug}.avif`);
        }
      }
      // Subklassen zählen nicht zum Status — der bewertet die Klassen-/Hintergrund-Serie.
      const freshSub = [];
      for (const part of ['sa', 'sb', 'sc', 'sd', 'se', 'sf', 'sg', 'sh']) {
        for (const slug of slugsIn(`design/art/figures-sub/${key}-${part}`, '.png')) {
          if (existsSync(join(ROOT, base, 'subclasses', `${slug}.avif`))) freshSub.push(`/${base}/subclasses/${slug}.avif`);
        }
      }
      figures[key] = {
        species: existsSync(join(ROOT, base, 'species.avif')) ? versioned(`${base}/species.avif`) : null,
        classes: imageMap(`${base}/classes`),
        backgrounds: imageMap(`${base}/backgrounds`),
        subclasses: imageMap(`${base}/subclasses`),
        fresh: [...fresh, ...freshSub],
        status: fresh.length >= variantCount ? 'final' : fresh.length ? 'running' : 'old',
      };
    }
  }

  // Rohbilder der Läufe und Experimente, je Ordner eine Gruppe.
  const raw = [];
  for (const parent of ['design/art/figures-base', 'design/art/figures-var', 'design/art/figures-sub']) {
    for (const group of ls(parent)) {
      const dir = `${parent}/${group}`;
      if (!statSync(join(ROOT, dir)).isDirectory()) continue;
      raw.push({ group, files: slugsIn(dir, '.png').map((n) => ({ name: n, url: `/${dir}/${n}.png` })) });
    }
  }
  const notes = ls('design/art/figures').filter((f) => f.endsWith('.md')).map((f) => `/design/art/figures/${f}`);

  return {
    looks: LOOKS,
    species: Object.entries(speciesDe).map(([slug, de]) => ({ slug, de })),
    classes: classes.map((slug) => ({ slug, de: classDe[slug] ?? slug })),
    backgrounds: Object.entries(backgroundDe).map(([slug, de]) => ({ slug, de })),
    subclasses: subclasses.map(({ slug, cls }) => ({ slug, cls, de: classDe[slug] ?? slug })),
    figures,
    legacy: {
      combos: imageMap('static/art/combos'),
      classes: imageMap('static/art/classes'),
      backgrounds: imageMap('static/art/backgrounds'),
    },
    raw,
    notes,
    versions,
  };
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/redo.json' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    // Einzeländerung statt ganzer Liste: sonst überschreibt ein offener Tab Einträge, die anderswo dazukamen.
    req.on('end', () => {
      const { add, remove, confirm, dismiss, plan, redrawn } = JSON.parse(body);
      let list = existsSync(REDO) ? JSON.parse(readFileSync(REDO, 'utf8')) : [];
      const at = new Date().toISOString();
      if (plan) {
        list = list.map((r) => (plan.includes(r.url) ? { ...r, planned: at, redrawn: undefined } : r));
      } else if (redrawn) {
        list = list.map((r) => (r.url === redrawn ? { ...r, redrawn: at } : r));
      } else if (confirm || dismiss) {
        // Verworfene Vorschläge bleiben stehen, damit eine spätere Prüfung sie nicht erneut vorschlägt.
        list = list.map((r) => (r.url === confirm ? { ...r, confirmed: true, note: add?.note ?? r.note }
          : r.url === dismiss ? { ...r, dismissed: true } : r));
      } else {
        list = list.filter((r) => r.url !== (remove ?? add?.url));
        if (add) list.push(add);
      }
      writeFileSync(REDO, JSON.stringify(list, null, 2));
      res.writeHead(200, { 'content-type': TYPES['.json'] });
      res.end(JSON.stringify(list));
    });
    return;
  }
  if (path === '/redo.json') {
    res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
    return res.end(existsSync(REDO) ? readFileSync(REDO) : '[]');
  }
  if (path === '/manifest.json') {
    res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
    return res.end(JSON.stringify(manifest()));
  }
  const file = path === '/' ? join(ROOT, 'design/art-lab/index.html') : resolve(ROOT, `.${path}`);
  const allowed = [join(ROOT, 'static', 'art'), join(ROOT, 'design')].some((d) => file.startsWith(d + sep));
  if ((path !== '/' && !allowed) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('nicht gefunden');
  }
  const cache = new URL(req.url, 'http://x').searchParams.has('v') ? 'max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': cache });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Bild-Werkbank: http://localhost:${PORT}`));
