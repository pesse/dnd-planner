/**
 * Schnell-Baukasten für Eval-Strecken.
 *
 * Ziel: eine neue Strecke für einen (einfachen) Prompt besteht aus EINER Datei mit
 * Fällen + Assertions — kein Vitest-/Report-/Env-Boilerplate. Alles Mechanische
 * (Gate über den API-Key, LlmConfig, Capture der echten Requests, N Läufe je Fall,
 * inkrementeller Report, Qualitäts-Gate) steckt hier.
 *
 *   defineEval<Spell>({
 *     name: 'spell',
 *     cases: [
 *       {
 *         label: 'Anlage aus Beschreibung',
 *         action: () => createSpellAction({ name: 'Rankenfessel' }),
 *         input: 'Ein Zauber des 2. Grades …',
 *         core: { 'Grad 2': (s) => s.level === 2 },
 *         soft: { 'deutsche Beschreibung': (s) => nonEmpty(s.desc_de) },
 *       },
 *     ],
 *   });
 *
 * Es gibt bewusst KEINEN A/B-Vergleich: ein Lauf misst genau einen Prompt-Stand und
 * schreibt einen Report. Verglichen wird über mehrere Läufe (`--title <label>`) und
 * das Nebeneinanderlegen der Reports.
 *
 * Für komplexere Pfade (mehrere verkettete Calls, eigener Produktionspfad) statt
 * `action`/`input` einfach `run` setzen — siehe featureEffects.eval.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LlmConfig } from '../src/lib/types';
import type { AiAction } from '../src/lib/services/aiActions/types';
import { coreAssertions, printStepReport, runEval, type Assertion, type EvalStep, type StepReport } from './harness';
import { installCapture, writeEvalReport, type EvalReport } from './report';
import { evalEnv } from './env';

/** Eine einzelne Prüfung auf dem Ergebnis eines Laufs. */
export type Check<T> = (result: T) => boolean;

/** Assertions als Objekt: Label → Prüfung. Das Label landet 1:1 im Report. */
export type Checks<T> = Record<string, Check<T>>;

export interface EvalCase<T> {
  /** Anzeigename des Falls im Report (z.B. „Anlage aus Beschreibung"). */
  label: string;
  /**
   * Die zu messende Produktions-Action. Als Funktion übergeben, damit sie erst beim
   * Lauf gebaut wird (Prompt-Änderungen greifen ohne Umweg).
   */
  action?: AiAction<T> | (() => AiAction<T>);
  /** Nutzereingabe an die Action (das, was in der App im Eingabefeld stünde). */
  input?: string;
  /**
   * Eigener Aufruf STATT `action`/`input` — für mehrstufige Produktionspfade.
   * `input` dient dann nur noch dem Report-Mitschnitt.
   */
  run?: (config: LlmConfig) => Promise<T>;
  /** Muss-Assertions: ihre Pass-Rate gatet den Schwellwert (rot/grün). */
  core?: Checks<T>;
  /** Kann-Assertions: werden nur berichtet, gaten nichts. */
  soft?: Checks<T>;
}

export interface EvalDefinition<T> {
  /** Kurzer Name der Strecke — Suite-Titel und Teil des Report-Ordners. */
  name: string;
  /** Was diese Strecke prüft (landet im Report-Kopf; EVAL_DESC überschreibt). */
  description?: string;
  /**
   * Die Fälle. Als Funktion (auch async), wenn zum Bauen erst etwas geladen werden
   * muss — z.B. Merkmale über den echten Vault-Ladepfad.
   */
  cases: EvalCase<T>[] | (() => EvalCase<T>[] | Promise<EvalCase<T>[]>);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/** Checks-Objekte → Assertion-Liste mit stabilen, eindeutigen IDs (aus dem Label). */
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

/**
 * Registriert eine komplette Eval-Suite (Vitest-`describe`) für einen Prompt-Stand.
 * Ohne API-Key/Modell wird sie übersprungen. Der Report landet unter
 * `evals/reports/<timestamp>-<name>[-<EVAL_TITLE>]/`.
 */
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
