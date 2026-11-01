// Meldet der Werkbank geänderte Bilder und Markierungen per Server-Sent Events.
import { watch, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const IMAGE = /\.(avif|png)$/;

/** Alle Bilder unter `dirs` mit ihrer Änderungszeit, Schlüssel = URL-Pfad. */
function scan(root, dirs) {
  const out = new Map();
  const walk = (abs) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(abs, e.name);
      if (e.isDirectory()) walk(p);
      else if (IMAGE.test(e.name)) out.set(`/${relative(root, p).split(sep).join('/')}`, Math.round(statSync(p).mtimeMs));
    }
  };
  for (const d of dirs) if (existsSync(join(root, d))) walk(join(root, d));
  return out;
}

/**
 * Vergleicht den Bildbestand nach jeder Dateisystem-Meldung (entprellt) und spätestens alle
 * `fallbackMs` — auf /mnt/c kommen keine Meldungen an.
 */
export function startLive(root, { dirs, files, fallbackMs = 15000 }) {
  const clients = new Set();
  let known = scan(root, dirs);
  const fileTimes = () => files.map((f) => (existsSync(join(root, f)) ? statSync(join(root, f)).mtimeMs : 0)).join();
  let knownFiles = fileTimes();
  let timer = null;

  const send = (msg) => { for (const res of clients) res.write(`data: ${JSON.stringify(msg)}\n\n`); };
  function check() {
    timer = null;
    const now = scan(root, dirs);
    const changed = {};
    let structure = false;
    for (const [url, v] of now) {
      if (!known.has(url)) structure = true;
      else if (known.get(url) !== v) changed[url] = v;
    }
    for (const url of known.keys()) if (!now.has(url)) structure = true;
    known = now;
    const f = fileTimes();
    const redo = f !== knownFiles;
    knownFiles = f;
    if (structure || redo || Object.keys(changed).length) send({ changed, structure, redo });
  }
  const soon = () => { if (!timer) timer = setTimeout(check, 400); };
  // Gefiltert: In den Pipeline-Ordnern schreiben laufende Codex-Läufe ständig Protokolle.
  const listen = (dir, opts, wanted) => {
    try { if (existsSync(join(root, dir))) watch(join(root, dir), opts, (_, name) => { if (name && wanted(String(name))) soon(); }); } catch { /* ohne Meldungen bleibt die Rückfallprüfung */ }
  };
  for (const d of dirs) listen(d, { recursive: true }, (name) => IMAGE.test(name));
  for (const f of files) listen(f.slice(0, f.lastIndexOf('/')), {}, (name) => name === f.slice(f.lastIndexOf('/') + 1));
  setInterval(check, fallbackMs);

  return (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': verbunden\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  };
}
