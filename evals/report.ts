/**
 * Datei-Report für die Evals.
 *
 * - `installCapture()` + `captureRun()` fangen die ECHTEN Requests/Responses ein,
 *   die `logDebug` (prod) über den Tap meldet — URL, redigierte Header, Body =
 *   voller Prompt+Schema, sowie content/usage/durationMs. Via AsyncLocalStorage
 *   werden sie korrekt dem jeweiligen Lauf zugeordnet, auch bei parallelen Läufen.
 * - `writeEvalReport()` schreibt vier Artefakte nach `evals/reports/<timestamp>-<titel>/`:
 *     report.html  — self-contained (Pass-Raten + je Lauf Request/Response/Ergebnis)
 *     summary.md   — menschenlesbar (Pass-Raten, Latenz, Tokens)
 *     summary.json — maschinenlesbar (Aggregate)
 *     runs.jsonl   — ein Lauf pro Zeile mit vollem Request + roher Response + Zeiten
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setDebugTap, type DebugEntry } from '../src/lib/stores/debug';
import type { StepReport } from './harness';
// @ts-expect-error — reine JS-Utility ohne Typdeklaration
import { writeReportIndex } from './reportIndex.mjs';

export type CapturedCall = DebugEntry;

/**
 * Per-Lauf-Capture der echten Requests/Responses — korrekt AUCH bei parallelen Läufen.
 *
 * `logDebug` (prod) ruft den Tap; der Tap schiebt jeden Eintrag in den ALS-Kontext
 * des gerade laufenden `captureRun`. Weil AsyncLocalStorage über await-Grenzen hinweg
 * propagiert, landet jeder Eintrag zuverlässig beim richtigen Lauf, egal wie sich die
 * Requests zeitlich verschränken.
 */
const als = new AsyncLocalStorage<CapturedCall[]>();

/** Registriert den Tap (einmal in beforeAll). Rückgabe: Deinstallation (afterAll). */
export function installCapture(): () => void {
  setDebugTap((entry) => als.getStore()?.push(entry));
  return () => setDebugTap(null);
}

/** Führt `fn` aus und sammelt alle in diesem Kontext geloggten Debug-Einträge. */
export async function captureRun<T>(
  fn: () => Promise<T>,
): Promise<{ result?: T; error?: unknown; entries: CapturedCall[] }> {
  const entries: CapturedCall[] = [];
  try {
    const result = await als.run(entries, fn);
    return { result, entries };
  } catch (error) {
    return { error, entries };
  }
}

export interface EvalReport {
  generatedAt: string;
  model: string;
  provider: string;
  /** Kurzer Titel zum Unterscheiden der Reports (z.B. der Prompt-Name). */
  title: string;
  /** Optionale Beschreibung: was dieser Lauf testet / was am Prompt anders ist. */
  description?: string;
  runsPerStep: number;
  threshold: number;
  /** Max. gleichzeitige Läufe je Step (1 = sequenziell, saubere Einzel-Latenz). */
  concurrency: number;
  /** Step-Reports dieses einen Prompts. */
  steps: StepReport[];
}

const latencyNote = (concurrency: number) =>
  concurrency > 1
    ? ` (Latenz unter Last, concurrency=${concurrency} — für saubere Einzel-Latenz EVAL_CONCURRENCY=1)`
    : '';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Ordner je Report: <timestamp>[-<titel>], damit sich mehrere Läufe unterscheiden lassen. */
function reportsDir(report: EvalReport): string {
  const ts = report.generatedAt.replace(/[:.]/g, '-');
  const title = slugify(report.title);
  const slug = title ? `${ts}-${title}` : ts;
  return fileURLToPath(new URL(`./reports/${slug}/`, import.meta.url));
}

function md(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`# Eval-Report: ${report.title}`);
  lines.push('');
  if (report.description) {
    lines.push(`> ${report.description}`);
    lines.push('');
  }
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- provider/model: ${report.provider} / ${report.model}`);
  lines.push(
    `- runs/step: ${report.runsPerStep}, threshold: ${Math.round(report.threshold * 100)}%, ` +
      `concurrency: ${report.concurrency}${latencyNote(report.concurrency)}`,
  );

  for (const step of report.steps) {
    lines.push('');
    lines.push(`## ${step.step}`);
    lines.push(
      `Läufe ${step.runs}, Fehler ${step.errors} · ` +
        `Latenz min/median/avg/p95/max: ${step.latencyMs.min}/${step.latencyMs.median}/` +
        `${step.latencyMs.avg}/${step.latencyMs.p95}/${step.latencyMs.max} ms · ` +
        `gesamt ${(step.latencyMs.total / 1000).toFixed(1)}s`,
    );
    if (step.serverMs.total > 0) {
      lines.push(
        `Server-Zeit avg/p95: ${step.serverMs.avg}/${step.serverMs.p95} ms · ` +
          `Tokens Input/Output: ${step.tokens.sentTotal}/${step.tokens.receivedTotal} gesamt ` +
          `(~${step.tokens.avgSent}/${step.tokens.avgReceived} pro Lauf)`,
      );
    }
    lines.push('');
    lines.push('| Assertion | Art | Pass-Rate | Passes |');
    lines.push('|---|---|---:|---:|');
    for (const a of step.assertions) {
      lines.push(
        `| ${a.label} | ${a.core ? 'core' : 'soft'} | ${Math.round(a.passRate * 100)}% | ${a.passes}/${a.runs} |`,
      );
    }
    if (step.errorSamples.length) {
      lines.push('');
      lines.push(`Fehlerbeispiele: ${step.errorSamples.map((e) => `\`${e}\``).join(', ')}`);
    }
  }
  lines.push('');
  lines.push(`_Rohe Requests/Responses je Lauf: siehe runs.jsonl_`);
  return lines.join('\n');
}

/** Aggregat ohne die schweren Roh-Mitschnitte (die stehen in runs.jsonl). */
function summaryJson(report: EvalReport): unknown {
  return {
    ...report,
    steps: report.steps.map((s) => ({
      step: s.step,
      runs: s.runs,
      errors: s.errors,
      latencyMs: s.latencyMs,
      serverMs: s.serverMs,
      tokens: s.tokens,
      assertions: s.assertions,
      errorSamples: s.errorSamples,
    })),
  };
}

function runsJsonl(report: EvalReport): string {
  const rows: string[] = [];
  for (const step of report.steps) {
    for (const r of step.records) {
      rows.push(
        JSON.stringify({
          title: report.title,
          step: step.step,
          index: r.index,
          ok: r.ok,
          error: r.error,
          latencyMs: r.latencyMs,
          serverMs: r.serverMs,
          usage: r.usage,
          assertions: r.assertions,
          calls: r.calls,
          result: r.result,
        }),
      );
    }
  }
  return rows.join('\n') + '\n';
}

// ── Self-contained HTML-Report (reines HTML/CSS, <details> zum Aufklappen) ───────

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const secs = (ms?: number) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);

/**
 * Request-Debug-Eintrag → exakter, gesendeter Request. Zeigt Endpoint, alle
 * Body-Parameter außer `messages` (u.a. `response_format`, `model`, `temperature`,
 * `tools`) als JSON, dann die Messages lesbar — plus den vollständigen Roh-Body.
 */
function renderRequest(request: unknown): string {
  const req = request as { url?: string; body?: Record<string, unknown> } | undefined;
  const body = req?.body;
  if (!body) return `<pre>${esc(JSON.stringify(request, null, 2))}</pre>`;

  const endpoint = req?.url ? `<div class="msg"><div class="role">POST</div><pre>${esc(req.url)}</pre></div>` : '';

  const params: Record<string, unknown> = { ...body };
  delete params.messages;
  const paramsBlock = Object.keys(params).length
    ? `<div class="msg"><div class="role">params</div><pre>${esc(JSON.stringify(params, null, 2))}</pre></div>`
    : '';

  const messages = Array.isArray(body.messages)
    ? (body.messages as { role: string; content: string }[])
        .map((m) => `<div class="msg"><div class="role">${esc(m.role)}</div><pre>${esc(m.content)}</pre></div>`)
        .join('')
    : '';

  const raw = `<details class="sub"><summary>Voller Request-Body (JSON)</summary><pre>${esc(JSON.stringify(body, null, 2))}</pre></details>`;

  return endpoint + paramsBlock + messages + raw;
}

/** Response-Debug-Eintrag → roher content (Fallback: JSON). */
function renderResponse(response: unknown): string {
  const content = (response as { content?: unknown })?.content;
  if (typeof content === 'string') return `<pre>${esc(content)}</pre>`;
  return `<pre>${esc(JSON.stringify(response, null, 2))}</pre>`;
}

function renderResults(report: EvalReport): string {
  return report.steps
    .map((step) => {
      const rows = step.assertions
        .map((a) => {
          const rate = Math.round(a.passRate * 100);
          const cls = rate >= 100 ? 'pass' : rate === 0 ? 'fail' : 'partial';
          return `<tr><td>${a.core ? '● ' : '○ '}${esc(a.label)}</td>` +
            `<td class="${cls}">${rate}%</td><td>${a.passes}/${a.runs}</td></tr>`;
        })
        .join('');
      return `<h3>${esc(step.step)}</h3>
      <table class="cmp"><thead><tr><th>Assertion</th><th>Pass-Rate</th><th>Passes</th></tr></thead><tbody>${rows}
      <tr class="meta"><td>avg latency</td><td colspan="2">${step.latencyMs.avg}ms (p95 ${step.latencyMs.p95}ms)</td></tr>
      <tr class="meta"><td>tok Input/Output</td><td colspan="2">~${step.tokens.avgSent}/${step.tokens.avgReceived} pro Lauf · ${step.tokens.sentTotal}/${step.tokens.receivedTotal} gesamt</td></tr>
      <tr class="meta"><td>errors</td><td colspan="2">${step.errors}</td></tr></tbody></table>`;
    })
    .join('');
}

function renderRuns(report: EvalReport): string {
  return report.steps
    .map((step) => {
      const labels = new Map(step.assertions.map((a) => [a.id, a.label]));
      const runs = step.records
        .map((r) => {
          const badges = r.assertions
            .map(
              (a) =>
                `<span class="badge ${a.pass ? 'pass' : 'fail'}">${a.pass ? '✓' : '✗'} ${esc(labels.get(a.id) ?? a.id)}</span>`,
            )
            .join(' ');
          const head =
            `Run ${r.index + 1} — ${r.ok ? 'ok' : 'FEHLER'} · ${secs(r.latencyMs)}` +
            `${r.serverMs ? ` (server ${secs(r.serverMs)})` : ''}` +
            `${r.usage ? ` · ${r.usage.sent}↑/${r.usage.received}↓ tok` : ''}` +
            `${r.calls.length > 1 ? ` · ${r.calls.length} Calls` : ''}`;
          // Jeder Call (Pass A Thinking, Pass C Guided, …) mit eigenem Request+Response.
          const callsHtml = r.calls
            .map((c, ci) => {
              const title = r.calls.length > 1 ? `Call ${ci + 1}` : 'Call';
              const meta =
                `${c.serverMs ? `server ${secs(c.serverMs)}` : ''}` +
                `${c.usage ? ` · ${c.usage.sent}↑/${c.usage.received}↓ tok` : ''}`;
              return `<details class="sub" open><summary>${title}${c.label ? ` (${esc(c.label)})` : ''}${meta ? ` · ${meta}` : ''}</summary>
              <details class="sub"><summary>Request (Prompt)</summary>${renderRequest(c.request)}</details>
              <details class="sub"><summary>Response (roh)</summary>${renderResponse(c.response)}</details>
              </details>`;
            })
            .join('');
          return `<details class="run ${r.ok ? '' : 'errored'}"><summary>${esc(head)}</summary>
          <div class="badges">${badges}</div>
          ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
          ${callsHtml}
          <details class="sub"><summary>Ergebnis (geparst)</summary><pre>${esc(JSON.stringify(r.result, null, 2))}</pre></details>
          </details>`;
        })
        .join('');
      return `<h3 class="variant">${esc(step.step)}</h3>${runs}`;
    })
    .join('');
}

function htmlReport(report: EvalReport): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eval-Report: ${esc(report.title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
  h1 { margin-bottom: .2rem; }
  .meta-line { color: #666; margin-top: 0; }
  .desc { margin: .2rem 0 .6rem; font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1.5rem; }
  th, td { border: 1px solid #ccc; padding: .35rem .6rem; text-align: left; }
  th { background: rgba(127,127,127,.12); }
  td.pass, .badge.pass { background: rgba(40,167,69,.18); }
  td.fail, .badge.fail { background: rgba(220,53,69,.18); }
  td.partial { background: rgba(255,193,7,.22); }
  tr.meta td { color: #666; font-size: .9em; }
  .variant { margin-top: 2rem; border-top: 2px solid #999; padding-top: .5rem; }
  details.run { border: 1px solid #ccc; border-radius: 6px; margin: .4rem 0; padding: .3rem .6rem; }
  details.run.errored { border-color: rgba(220,53,69,.6); }
  details.run > summary { cursor: pointer; font-weight: 600; }
  details.sub { margin: .4rem 0 .4rem 1rem; }
  details.sub > summary { cursor: pointer; color: #555; }
  .badges { margin: .4rem 0; }
  .badge { display: inline-block; border-radius: 4px; padding: .05rem .4rem; margin: .1rem; font-size: .82em; }
  .msg .role { font-weight: 600; text-transform: uppercase; font-size: .75em; color: #777; margin-top: .4rem; }
  pre { white-space: pre-wrap; word-break: break-word; background: rgba(127,127,127,.08); padding: .5rem; border-radius: 4px; }
  .err { color: #dc3545; font-family: monospace; }
</style></head>
<body>
<h1>Eval-Report: ${esc(report.title)}</h1>
${report.description ? `<p class="desc">${esc(report.description)}</p>` : ''}
<p class="meta-line">${esc(report.provider)} / ${esc(report.model)} · ${esc(report.generatedAt)} ·
runs/step: ${report.runsPerStep} · threshold: ${Math.round(report.threshold * 100)}% ·
concurrency: ${report.concurrency}${esc(latencyNote(report.concurrency))}</p>
<h2>Ergebnisse (Pass-Raten)</h2>
${renderResults(report)}
<h2>Läufe (echte Requests &amp; Responses)</h2>
${renderRuns(report)}
</body></html>`;
}

/** Schreibt summary.md / summary.json / runs.jsonl / report.html und gibt das Verzeichnis zurück. */
export function writeEvalReport(report: EvalReport): string {
  const dir = reportsDir(report);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}summary.md`, md(report), 'utf8');
  writeFileSync(`${dir}summary.json`, JSON.stringify(summaryJson(report), null, 2), 'utf8');
  writeFileSync(`${dir}runs.jsonl`, runsJsonl(report), 'utf8');
  writeFileSync(`${dir}report.html`, htmlReport(report), 'utf8');
  // Übersicht (manifest.json + index.html) automatisch aktualisieren — ein
  // Fehler hier darf den Eval-Lauf nie kippen.
  try {
    writeReportIndex(fileURLToPath(new URL('./reports/', import.meta.url)));
  } catch (err) {
    console.warn('[eval] Report-Index konnte nicht aktualisiert werden:', err);
  }
  return dir;
}
