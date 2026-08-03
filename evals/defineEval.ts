/**
 * Eine Eval-Strecke ist EINE Datei mit Fällen und Assertions; alles Mechanische (Key-Gate,
 * Capture, N Läufe, Report) steckt hier. Bewusst KEIN A/B-Vergleich: ein Lauf misst einen
 * Prompt-Stand, verglichen wird über `--title` und das Nebeneinanderlegen der Reports.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LlmConfig } from '../src/lib/types';
import type { AiAction } from '../src/lib/services/aiActions/types';
import { coreAssertions, printStepReport, runEval, type Assertion, type EvalStep, type StepReport } from './harness';
import { installCapture, writeEvalReport, type EvalReport } from './report';
import { evalEnv } from './env';

export type Check<T> = (result: T) => boolean;

/** Label → Prüfung; das Label landet 1:1 im Report. */
export type Checks<T> = Record<string, Check<T>>;

export interface EvalCase<T> {
  label: string;
  /** Als Funktion, damit die Action erst beim Lauf gebaut wird und Prompt-Änderungen greifen. */
  action?: AiAction<T> | (() => AiAction<T>);
  input?: string;
  /** STATT `action`/`input` für mehrstufige Pfade; `input` ist dann nur Report-Mitschnitt. */
  run?: (config: LlmConfig) => Promise<T>;
  /** Ihre Pass-Rate gatet den Schwellwert. */
  core?: Checks<T>;
  /** Werden nur berichtet, gaten nichts. */
  soft?: Checks<T>;
}

export interface EvalDefinition<T> {
  name: string;
  /** Landet im Report-Kopf; `EVAL_DESC` überschreibt. */
  description?: string;
  /** Als Funktion, wenn zum Bauen erst geladen werden muss (echter Vault-Ladepfad). */
  cases: EvalCase<T>[] | (() => EvalCase<T>[] | Promise<EvalCase<T>[]>);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/** IDs werden aus dem Label abgeleitet und müssen stabil bleiben — der Report matcht darauf. */
function toAssertions<T>(core: Checks<T> = {}, soft: Checks<T> = {}): Assertion<T>[] {
  const used = new Set<string>();
  const build = (checks: Checks<T>, isCore: boolean): Assertion<T>[] =>
    Object.entries(checks).map(([label, check]) => {
      let id = slug(label) || 'assertion';
      for (let i = 2; used.has(id); i++) id = `${slug(label)}-${i}`;
      used.add(id);
      return { id, label, core: isCore, check };
    });
  return [...build(core, true), ...build(soft, false)];
}

function toStep<T>(c: EvalCase<T>): EvalStep<T> {
  if (!c.run && !c.action) {
    throw new Error(`[eval] Fall "${c.label}" braucht entweder \`action\` oder \`run\`.`);
  }
  const assertions = toAssertions(c.core, c.soft);
  if (assertions.length === 0) {
    throw new Error(`[eval] Fall "${c.label}" hat keine Assertions (core/soft leer).`);
  }
  return {
    label: c.label,
    input: c.input ?? '',
    action: typeof c.action === 'function' ? c.action() : c.action,
    run: c.run,
    assertions,
  };
}

/** Ohne API-Key/Modell wird die Suite übersprungen, statt zu scheitern. */
export function defineEval<T>(def: EvalDefinition<T>): void {
  const env = evalEnv();
  const title = env.label ? `${def.name}-${env.label}` : def.name;

  describe.skipIf(!env.enabled)(`${def.name} — Prompt-Qualität`, () => {
    const generatedAt = new Date().toISOString();
    let steps: EvalStep<T>[];
    let uninstallCapture: (() => void) | undefined;

    const persist = (stepReports: StepReport[]): string => {
      const report: EvalReport = {
        generatedAt,
        model: env.model,
        provider: env.provider,
        title,
        description: env.description ?? def.description,
        runsPerStep: env.runs,
        threshold: env.threshold,
        concurrency: env.concurrency,
        steps: stepReports,
      };
      return writeEvalReport(report);
    };

    beforeAll(async () => {
      const cases = typeof def.cases === 'function' ? await def.cases() : def.cases;
      if (cases.length === 0) throw new Error(`[eval] Strecke "${def.name}" hat keine Fälle.`);
      steps = cases.map(toStep);
      uninstallCapture = installCapture();
      console.log(
        `\n[eval:${def.name}] model=${env.model}, runs=${env.runs}, ` +
          `concurrency=${env.concurrency}, threshold=${Math.round(env.threshold * 100)}%`,
      );
    });

    afterAll(() => uninstallCapture?.());

    it(`"${title}" erreicht den Schwellwert auf allen Core-Assertions`, async () => {
      let dir = '';
      const reports = await runEval(
        env.config,
        null, // Action steckt am jeweiligen Step (oder der Step hat ein eigenes `run`).
        steps,
        env.runs,
        env.concurrency,
        // Inkrementell nach jedem Fall schreiben → ein Timeout verliert keine Daten.
        (partial, justFinished) => {
          printStepReport(justFinished);
          dir = persist(partial);
        },
      );

      dir = persist(reports);
      console.log(`\n[eval:${def.name}] Report geschrieben nach:\n  ${dir}\n  → report.html im Browser öffnen`);

      for (const report of reports) {
        for (const a of coreAssertions(report)) {
          expect(a.passRate, `${report.step} › ${a.label}`).toBeGreaterThanOrEqual(env.threshold);
        }
      }
    });
  });
}
