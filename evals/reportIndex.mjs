/**
 * Report-Übersicht (`evals/reports/index.html`).
 *
 * Die Seite ist ein DYNAMISCHER Shell: beim Laden holt sie sich per `fetch`
 * die `manifest.json` (die Liste aller Reports samt Metadaten) und rendert die
 * Tabelle im Browser. Deshalb muss die Übersicht NICHT bei jeder Änderung neu
 * gebaut werden — sie liest den aktuellen Stand zur Laufzeit. Voraussetzung:
 * über einen HTTP-Server / localhost öffnen (per `file://` blockt der Browser
 * das `fetch`).
 *
 * `manifest.json` wird automatisch nach jedem Eval-Lauf aus `writeEvalReport`
 * (report.ts) heraus geschrieben — ein separater Aufruf ist also nicht nötig.
 * Manuell neu bauen (z.B. nach Löschen alter Reports) geht weiterhin mit:
 *
 *   npm run eval:index
 */
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'reports');

/** Aggregiert passes/runs über eine Assertion-Menge zu einer Pass-Rate (0..1) oder null. */
function passRate(assertions) {
  let passes = 0;
  let runs = 0;
  for (const a of assertions) {
    passes += a.passes ?? 0;
    runs += a.runs ?? 0;
  }
  return runs > 0 ? passes / runs : null;
}

/** Liest einen Report-Ordner ein und leitet die Anzeige-Metadaten ab (oder null). */
function readReport(dirName, reportsDir) {
  const dir = join(reportsDir, dirName);
  const summaryPath = join(dir, 'summary.json');
  const htmlPath = join(dir, 'report.html');
  if (!existsSync(htmlPath)) return null; // ohne report.html nichts zu verlinken

  let summary = {};
  if (existsSync(summaryPath)) {
    try {
      summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    } catch {
      summary = {};
    }
  }

  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  const allAssertions = steps.flatMap((s) => s.assertions ?? []);
  const coreAssertions = allAssertions.filter((a) => a.core);
  const errors = steps.reduce((n, s) => n + (s.errors ?? 0), 0);
  const latencySum = steps.reduce((n, s) => n + (s.latencyMs?.avg ?? 0), 0);
  const avgLatency = steps.length ? latencySum / steps.length : null;

  // generatedAt bevorzugt aus summary, sonst aus dem Ordner-Timestamp-Präfix.
  let generatedAt = summary.generatedAt ?? null;
  if (!generatedAt) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(dirName);
    if (m) generatedAt = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
  }
  const sortKey = generatedAt ? Date.parse(generatedAt) : statSync(dir).mtimeMs;

  return {
    dir: dirName,
    href: `./${encodeURIComponent(dirName)}/report.html`,
    title: summary.title ?? dirName,
    description: summary.description ?? '',
    model: summary.model ?? '',
    provider: summary.provider ?? '',
    runsPerStep: summary.runsPerStep ?? null,
    threshold: summary.threshold ?? null,
    generatedAt,
    sortKey,
    stepCount: steps.length,
    errors,
    avgLatency,
    coreRate: passRate(coreAssertions),
    softRate: passRate(allAssertions.filter((a) => !a.core)),
  };
}

/** Scannt den Reports-Ordner und liefert alle Reports, neueste zuerst. */
export function scanReports(reportsDir = REPORTS_DIR) {
  if (!existsSync(reportsDir)) return [];
  return readdirSync(reportsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readReport(e.name, reportsDir))
    .filter(Boolean)
    .sort((a, b) => b.sortKey - a.sortKey);
}

/**
 * Schreibt `manifest.json` (aktuelle Report-Liste) und stellt sicher, dass der
 * `index.html`-Shell existiert. Idempotent — gefahrlos nach jedem Eval-Lauf.
 */
export function writeReportIndex(reportsDir = REPORTS_DIR) {
  const reports = scanReports(reportsDir);
  const manifest = { generatedAt: new Date().toISOString(), reports };
  writeFileSync(join(reportsDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  writeFileSync(join(reportsDir, 'index.html'), SHELL_HTML, 'utf8');
  return reports.length;
}

/**
 * Statischer Shell — enthält KEINE Report-Daten, sondern lädt `manifest.json`
 * zur Laufzeit. Ändert sich nur, wenn wir das Layout anpassen.
 */
const SHELL_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Eval-Reports — Übersicht</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 1.5rem clamp(1rem, 4vw, 3rem); line-height: 1.4; }
  h1 { margin: 0 0 .2rem; font-size: 1.5rem; }
  .sub { margin: 0 0 1.2rem; opacity: .7; font-size: .9rem; }
  .toolbar { display: flex; gap: .8rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
  input[type=search] { flex: 1 1 16rem; padding: .5rem .7rem; font-size: 1rem; border: 1px solid rgba(127,127,127,.4); border-radius: 6px; background: transparent; color: inherit; }
  button.refresh { padding: .5rem .8rem; font-size: .9rem; border: 1px solid rgba(127,127,127,.4); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
  button.refresh:hover { background: rgba(127,127,127,.1); }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  th, td { text-align: left; padding: .55rem .6rem; border-bottom: 1px solid rgba(127,127,127,.22); vertical-align: top; }
  th { background: rgba(127,127,127,.12); position: sticky; top: 0; font-weight: 600; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.nowrap, th.nowrap { white-space: nowrap; }
  tr.row:hover { background: rgba(127,127,127,.07); }
  a { color: inherit; }
  a.title { font-weight: 600; font-size: 1rem; text-decoration: none; }
  a.title:hover { text-decoration: underline; }
  .desc { font-style: italic; opacity: .8; margin: .15rem 0; max-width: 42rem; }
  .meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .72rem; opacity: .55; }
  .model { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .badge.pass { background: rgba(40,167,69,.22); }
  .badge.partial { background: rgba(255,193,7,.28); }
  .badge.fail { background: rgba(220,53,69,.22); }
  .empty { padding: 2rem; opacity: .6; text-align: center; }
  footer { margin-top: 1.5rem; font-size: .78rem; opacity: .55; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
  <h1>Eval-Reports</h1>
  <p class="sub" id="sub">lädt …</p>

  <div class="toolbar">
    <input type="search" id="filter" placeholder="Filtern nach Titel, Beschreibung, Modell …" autofocus />
    <button class="refresh" id="refresh" title="manifest.json neu laden">↻ Neu laden</button>
  </div>

  <div id="content"></div>

  <footer>Liest <code>manifest.json</code> zur Laufzeit — über localhost/HTTP öffnen. Das Manifest wird nach jedem Eval-Lauf automatisch aktualisiert.</footer>

  <script>
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtRate = (r) => (r == null ? '—' : Math.round(r * 100) + '%');
    const fmtLatency = (ms) => (ms == null ? '—' : ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms');
    const fmtDate = (iso) => {
      if (!iso) return '—';
      const t = Date.parse(iso);
      if (Number.isNaN(t)) return esc(iso);
      const d = new Date(t), p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    };
    const rateClass = (rate, threshold) => {
      if (rate == null) return '';
      if (threshold != null) return rate >= threshold ? 'pass' : rate > 0 ? 'partial' : 'fail';
      return rate >= 0.999 ? 'pass' : rate > 0 ? 'partial' : 'fail';
    };

    function renderRow(r) {
      const cls = rateClass(r.coreRate, r.threshold);
      const err = r.errors > 0 ? ' <span class="badge fail">' + r.errors + ' Fehler</span>' : '';
      const search = (r.title + ' ' + r.description + ' ' + r.model + ' ' + r.dir).toLowerCase();
      return '<tr class="row" data-search="' + esc(search) + '">' +
        '<td><a class="title" href="' + r.href + '" target="_blank" rel="noopener">' + esc(r.title) + '</a>' +
          (r.description ? '<div class="desc">' + esc(r.description) + '</div>' : '') +
          '<div class="meta">' + esc(r.dir) + '</div></td>' +
        '<td class="nowrap">' + fmtDate(r.generatedAt) + '</td>' +
        '<td><span class="badge ' + cls + '">' + fmtRate(r.coreRate) + '</span>' + err + '</td>' +
        '<td class="num">' + (r.softRate == null ? '—' : fmtRate(r.softRate)) + '</td>' +
        '<td class="num">' + (r.stepCount || '—') + '</td>' +
        '<td class="num">' + (r.runsPerStep ?? '—') + '</td>' +
        '<td class="num nowrap">' + fmtLatency(r.avgLatency) + '</td>' +
        '<td class="model" title="' + esc(r.model) + '">' + esc(r.model) + '</td>' +
        '<td class="nowrap"><a href="' + r.href + '" target="_blank" rel="noopener">öffnen ↗</a></td>' +
      '</tr>';
    }

    function applyFilter() {
      const q = document.getElementById('filter').value.trim().toLowerCase();
      for (const r of document.querySelectorAll('#rows tr.row')) {
        r.style.display = !q || r.dataset.search.includes(q) ? '' : 'none';
      }
    }

    async function load() {
      const sub = document.getElementById('sub');
      const content = document.getElementById('content');
      try {
        const res = await fetch('./manifest.json?_=' + Date.now());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const { reports = [], generatedAt } = await res.json();
        sub.textContent = reports.length + ' Report' + (reports.length === 1 ? '' : 's') +
          (generatedAt ? ' · Manifest ' + fmtDate(generatedAt) : '');
        if (!reports.length) {
          content.innerHTML = '<div class="empty">Keine Reports gefunden. Erst einen Eval-Lauf starten (<code>npm run eval</code>).</div>';
          return;
        }
        content.innerHTML = '<table><thead><tr>' +
          '<th>Report</th><th class="nowrap">Erstellt</th><th>Core-Rate</th>' +
          '<th class="num">Soft</th><th class="num">Steps</th><th class="num">Runs</th>' +
          '<th class="num nowrap">Ø Latenz</th><th>Modell</th><th></th></tr></thead>' +
          '<tbody id="rows">' + reports.map(renderRow).join('') + '</tbody></table>';
        applyFilter();
      } catch (e) {
        sub.textContent = '';
        content.innerHTML = '<div class="empty">Konnte <code>manifest.json</code> nicht laden (' + esc(e.message) + ').<br>' +
          'Diese Seite über <b>localhost/HTTP</b> öffnen, nicht per <code>file://</code>.</div>';
      }
    }

    document.getElementById('filter').addEventListener('input', applyFilter);
    document.getElementById('refresh').addEventListener('click', load);
    load();
  </script>
</body>
</html>
`;

// Direkt aufgerufen (`node evals/reportIndex.mjs`) → manuell neu bauen.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = writeReportIndex();
  console.log(`Report-Übersicht aktualisiert: ${join(REPORTS_DIR, 'index.html')} + manifest.json (${n} Reports)`);
}
