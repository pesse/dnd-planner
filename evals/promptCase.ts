/**
 * Prompt-Werkstatt: rohe Prompts messen — ohne dass es dafür schon eine `AiAction` gibt.
 *
 * Zwei Bausteine, beide liefern einen ganz normalen `EvalCase` für `defineEval`:
 *
 *  - `promptCase(...)` — EIN Call: System + User (+ Schema/Server-Parameter).
 *  - `chatCase(...)`   — ein ganzer VERLAUF aus Turns: feste Nachrichten und echte
 *                        Modell-Antworten in beliebiger Reihenfolge. Eine Live-Antwort
 *                        landet im Verlauf und steht dem nächsten Turn zur Verfügung,
 *                        auch für dynamisch gebaute Folgefragen („der Spieler wählt die
 *                        erste Option, die das Modell angeboten hat").
 *
 * Beide gehen über dieselbe Transport-Schicht wie die App (`rawChatCompletion` in
 * llmService.ts) — also mit Streaming, Rate-Limit-Retry, Token-Zählung und
 * Debug-Mitschnitt, den der Report ausliest. Jeder Live-Turn ist im Report ein
 * eigener Call mit eigenem Request/Response.
 */
import { z } from 'zod';
import type { LlmConfig } from '../src/lib/types';
import type { ChatMessage } from '../src/lib/services/llmService';
import { rawChatCompletion } from '../src/lib/services/llmService';
import { jsonOutputInstruction } from '../src/lib/services/aiActions/runner';
import { toLlmJsonSchema } from '../src/lib/schemas/shared';
import { extractJson, stripJsonFence } from '../src/lib/services/jsonFence';
import type { Checks, EvalCase } from './defineEval';

/**
 * Wie das Schema an den Server geht:
 *  - `'native'` (Default, sobald ein Schema da ist) — vllm guided decoding über
 *    `structured_outputs.json`; erzwingt zusätzlich `enable_thinking:false`, weil
 *    die Grammatik sonst nicht greift (siehe llmService).
 *  - `'prompt'` — Schema NUR als Instruktion (exakt der Wortlaut, den der Runner ohne
 *    nativen Structured Output nutzt), Antwort wird tolerant geparst. Der Vergleich
 *    `'native'` vs. `'prompt'` ist damit ein zweiter Lauf bzw. ein zweiter Fall.
 *  - `'parse'` — am Request ändert sich NICHTS; das Schema dient nur dem Parsen und
 *    Validieren der Antwort. Das Richtige, wenn der Prompt das Ausgabeformat bereits
 *    selbst beschreibt (sonst stünde die Formatvorgabe doppelt im Prompt).
 *  - `'off'` — kein JSON; das Ergebnis ist der rohe Antworttext.
 */
export type StructuredMode = 'native' | 'prompt' | 'parse' | 'off';

/** Gemeinsame Server-Stellschrauben von `promptCase` und einem Live-Turn. */
interface CallOptions {
  /**
   * Erwartetes Ergebnis-Schema. **Zod-Schema** (wird zusätzlich zum Validieren des
   * Ergebnisses genutzt — Schema-Verstoß = fehlgeschlagener Lauf) oder ein fertiges
   * JSON-Schema-Objekt (dann ohne Validierung).
   */
  schema?: z.ZodType | object;
  /** Siehe `StructuredMode`. Default: `'native'` mit Schema, sonst `'off'`. */
  structured?: StructuredMode;
  /**
   * Temperatur dieses Calls. Ohne Angabe wird KEINE mitgeschickt (Server-Vorgabe) —
   * anders als die Action-Pfade, die das `TASK_TEMPERATURE`-Preset setzen.
   */
  temperature?: number;
  /** Antwort-Budget dieses Calls (sonst EVAL_MAX_TOKENS). */
  maxTokens?: number;
  /**
   * Beliebige weitere Body-Properties für `/chat/completions` (`top_p`,
   * `chat_template_kwargs`, `structured_outputs`, …). Gewinnen gegen alles andere —
   * damit lässt sich jeder Server-Parameter messen, bevor er in die App wandert.
   */
  body?: Record<string, unknown>;
  /** Label des Calls im Report-Mitschnitt (Default: 'eval-prompt'). */
  callLabel?: string;
}

// ── Gemeinsame Mechanik ─────────────────────────────────────────────────────────

const isZod = (s: unknown): s is z.ZodType =>
  !!s && typeof (s as { safeParse?: unknown }).safeParse === 'function';

/** Kürzt eine Antwort für Fehlermeldungen, damit der Report lesbar bleibt. */
const snippet = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

interface ResolvedCall {
  mode: StructuredMode;
  jsonSchema?: object;
  zodSchema?: z.ZodType;
  /** Body-Anteil, der aus Schema-Modus + `body` entsteht. */
  body: Record<string, unknown>;
}

/** Schema (Zod oder JSON) + Modus in das auflösen, was Call und Parser brauchen. */
function resolveCall(opts: CallOptions, what: string): ResolvedCall {
  const mode: StructuredMode = opts.structured ?? (opts.schema ? 'native' : 'off');
  if (mode !== 'off' && !opts.schema) {
    throw new Error(`[eval] ${what}: structured='${mode}' braucht ein \`schema\`.`);
  }
  const zodSchema = isZod(opts.schema) ? opts.schema : undefined;
  const jsonSchema = opts.schema ? (zodSchema ? toLlmJsonSchema(zodSchema) : (opts.schema as object)) : undefined;
  return {
    mode,
    jsonSchema,
    zodSchema,
    body: {
      ...(mode === 'native' && jsonSchema
        ? // Wie der Produktionspfad: guided decoding greift nur mit abgeschaltetem Thinking.
          { structured_outputs: { json: jsonSchema }, chat_template_kwargs: { enable_thinking: false } }
        : {}),
      ...opts.body,
    },
  };
}

/**
 * Tolerante Extraktion für Antworten aus Prosa + JSON. Bevorzugt den LETZTEN
 * ```json-Block (wie `parseManifest` in der Produktion — ein Beispiel-Block mitten im
 * Text soll das abschließende Ergebnis nicht verdrängen), sonst der Standardweg.
 */
function extractTrailingJson(content: string): unknown {
  const last = [...content.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]).at(-1);
  if (last) {
    try {
      return JSON.parse(last.trim());
    } catch {
      /* auf die allgemeine Extraktion zurückfallen */
    }
  }
  return extractJson(content);
}

/** Antworttext → Ergebnis: strikt bei nativem Schema, sonst tolerant. */
function parseAnswer(content: string, call: ResolvedCall): unknown {
  if (call.mode === 'off') return content;

  let data: unknown;
  if (call.mode === 'native') {
    try {
      data = JSON.parse(stripJsonFence(content));
    } catch {
      throw new Error(`Antwort war kein valides JSON: ${snippet(content)}`);
    }
  } else {
    data = extractTrailingJson(content);
    if (data == null) throw new Error(`Antwort enthielt kein JSON: ${snippet(content)}`);
  }

  if (!call.zodSchema) return data;
  const parsed = call.zodSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Antwort verletzt das Schema — ${issues}`);
  }
  return parsed.data;
}

/** Config mit den Overrides eines einzelnen Calls. */
const withOverrides = (config: LlmConfig, opts: CallOptions): LlmConfig => ({
  ...config,
  ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
  ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
});

// ── Ein Call: promptCase ────────────────────────────────────────────────────────

export interface PromptSpec<T> extends CallOptions {
  /** Anzeigename des Falls im Report. */
  label: string;
  /** System-Prompt (das, was in einer Action `buildSystemPrompt()` wäre). */
  system?: string;
  /** User-Nachricht. */
  user?: string;
  /** Voller Nachrichtenverlauf statt `system`/`user`. Für echte Turns: `chatCase`. */
  messages?: ChatMessage[];
  /** Muss-Assertions (gaten den Schwellwert). */
  core?: Checks<T>;
  /** Kann-Assertions (nur berichtet). */
  soft?: Checks<T>;
}

/**
 * Baut aus einem einzelnen Prompt einen `EvalCase`.
 *
 * Ergebnistyp: bei `structured: 'off'` der Antworttext (T = string), sonst das
 * geparste JSON — Typ explizit angeben (`promptCase<Npc>({…})`) oder aus dem
 * Zod-Schema ableiten (`promptCase<z.infer<typeof npcSchema>>({…})`).
 */
export function promptCase<T = string>(spec: PromptSpec<T>): EvalCase<T> {
  if (!spec.messages && !spec.user) {
    throw new Error(`[eval] promptCase "${spec.label}" braucht \`user\` oder \`messages\`.`);
  }
  const call = resolveCall(spec, `promptCase "${spec.label}"`);

  const messages: ChatMessage[] = spec.messages
    ? spec.messages.map((m) => ({ ...m }))
    : [
        ...(spec.system ? [{ role: 'system' as const, content: spec.system }] : []),
        { role: 'user' as const, content: spec.user ?? '' },
      ];
  // Ein-Call-Pfad: die Schema-Instruktion sitzt im System-Prompt — genau wie im
  // emulierten Runner-Pfad, damit der Vergleich zur Produktion trägt.
  if (call.mode === 'prompt' && call.jsonSchema) {
    const suffix = jsonOutputInstruction(call.jsonSchema);
    const sys = messages.find((m) => m.role === 'system');
    if (sys) sys.content += suffix;
    else messages.unshift({ role: 'system', content: suffix.trimStart() });
  }

  return {
    label: spec.label,
    // Nur für den Report-Kopf; der volle Request (inkl. System-Turn) steht im Mitschnitt.
    input: spec.user ?? JSON.stringify(messages),
    core: spec.core,
    soft: spec.soft,
    run: async (config: LlmConfig): Promise<T> => {
      const { content } = await rawChatCompletion(withOverrides(config, spec), messages, call.body, {
        label: spec.callLabel ?? 'eval-prompt',
      });
      return parseAnswer(content, call) as T;
    },
  };
}

// ── Mehrere Turns: chatCase ─────────────────────────────────────────────────────

/** Was ein dynamisch gebauter Turn über den bisherigen Verlauf weiß. */
export interface TurnContext {
  /** Verlauf bis hierher (inkl. System-Turn). */
  messages: readonly ChatMessage[];
  /** Geparste Ergebnisse ALLER bisherigen Live-Turns, in Reihenfolge. */
  outputs: readonly unknown[];
  /** Ergebnis des letzten Live-Turns (`undefined`, solange keiner lief). */
  last: unknown;
  /** Roher Antworttext des letzten Live-Turns. */
  lastText: string;
}

/** Fester Turn (Text oder aus dem Verlauf berechnet) bzw. eine echte Modell-Antwort. */
export type Turn =
  | { kind: 'message'; role: 'user' | 'assistant'; content: string | ((ctx: TurnContext) => string) }
  | { kind: 'reply'; spec: ReplySpec<unknown> };

export interface ReplySpec<T> extends CallOptions {
  /** Kurzlabel des Turns — im Report-Mitschnitt und als Präfix seiner Assertions. */
  label?: string;
  /** Muss-Assertions auf dem Ergebnis DIESES Turns. */
  core?: Checks<T>;
  /** Kann-Assertions auf dem Ergebnis dieses Turns. */
  soft?: Checks<T>;
}

/** User-Nachricht — fest oder aus dem bisherigen Verlauf gebaut. */
export const user = (content: string | ((ctx: TurnContext) => string)): Turn => ({
  kind: 'message',
  role: 'user',
  content,
});

/** VORGEGEBENE Assistant-Antwort (Fixture) — es wird nichts aufgerufen. */
export const assistant = (content: string | ((ctx: TurnContext) => string)): Turn => ({
  kind: 'message',
  role: 'assistant',
  content,
});

/**
 * ECHTE Modell-Antwort an dieser Stelle des Verlaufs. Sie wird als `assistant`-Turn
 * angehängt und steht damit allen folgenden Turns zur Verfügung.
 */
export const reply = <T = string>(spec: ReplySpec<T> = {}): Turn => ({
  kind: 'reply',
  spec: spec as ReplySpec<unknown>,
});

/** Ergebnis eines Verlaufs — Ergebnis des letzten Live-Turns plus alle Zwischenstände. */
export interface ChatRun {
  /** Geparstes Ergebnis des LETZTEN Live-Turns. */
  result: unknown;
  /** Alle Live-Turns in Reihenfolge: Label, roher Text, geparstes Ergebnis. */
  turns: { label: string; text: string; data: unknown }[];
}

export interface ChatSpec<TLast> extends CallOptions {
  /** Anzeigename des Falls im Report. */
  label: string;
  /** System-Prompt des Verlaufs. */
  system?: string;
  /** Die Turns in Reihenfolge — `user(…)`, `assistant(…)`, `reply(…)`. */
  turns: Turn[];
  /** Muss-Assertions auf dem Ergebnis des LETZTEN Live-Turns. */
  core?: Checks<TLast>;
  /** Kann-Assertions auf dem Ergebnis des letzten Live-Turns. */
  soft?: Checks<TLast>;
}

/** Assertions eines Live-Turns auf den `ChatRun` umbiegen (`turns[i].data`). */
function turnChecks(checks: Checks<never> | undefined, index: number, label: string): Checks<ChatRun> {
  const out: Checks<ChatRun> = {};
  for (const [name, check] of Object.entries(checks ?? {})) {
    out[`[${label}] ${name}`] = (run) => (check as (v: unknown) => boolean)(run.turns[index]?.data);
  }
  return out;
}

/** Assertions auf dem Endergebnis (letzter Live-Turn) auf den `ChatRun` umbiegen. */
function resultChecks(checks: Checks<never> | undefined): Checks<ChatRun> {
  const out: Checks<ChatRun> = {};
  for (const [name, check] of Object.entries(checks ?? {})) {
    out[name] = (run) => (check as (v: unknown) => boolean)(run.result);
  }
  return out;
}

/**
 * Baut aus einem ganzen Chat-Verlauf einen `EvalCase`.
 *
 * ```ts
 * chatCase<Manifest>({
 *   label: 'Analyse → Wahl → Effekte',
 *   system: ANALYSIS_SYSTEM,
 *   turns: [
 *     user(buildFeatureEffectsInput(ctx)),
 *     reply<Manifest>({ label: 'analyse', schema: manifestSchema, core: { … } }),
 *     user((c) => `Der Spieler wählt: ${(c.last as Manifest).choices[0].options[0]}`),
 *     reply<Manifest>({ label: 'nach-wahl', schema: manifestSchema }),
 *   ],
 *   core: { 'Zauber jetzt gewährt': (m) => m.spellsToGround.length > 0 },
 * });
 * ```
 *
 * Statt des ersten `reply(…)` kann ein `assistant('…')` stehen — dann wird der
 * Zwischenschritt als Fixture vorgegeben (deterministisch, ein Call weniger) und
 * gemessen wird nur der zweite Prompt.
 *
 * Assertions: `core`/`soft` am Fall gelten dem Ergebnis des LETZTEN Live-Turns;
 * jeder `reply(…)` kann zusätzlich eigene mitbringen (im Report mit `[label]`
 * präfigiert). Optionen am Fall (`schema`, `structured`, `temperature`, `body`, …)
 * sind Defaults für alle Live-Turns und je Turn überschreibbar.
 *
 * Rückgabetyp ist `EvalCase<TLast>` (Typ des letzten Live-Turns), damit Chat- und
 * Ein-Call-Fälle in EINEM `defineEval<T>` nebeneinander stehen können. Zur Laufzeit
 * ist das Ergebnis der vollständige `ChatRun` — im Report siehst du deshalb alle
 * Turns; die Assertions greifen intern auf die richtige Ebene zu.
 */
export function chatCase<TLast = unknown>(spec: ChatSpec<TLast>): EvalCase<TLast> {
  const replies = spec.turns.filter((t): t is Extract<Turn, { kind: 'reply' }> => t.kind === 'reply');
  if (replies.length === 0) {
    throw new Error(`[eval] chatCase "${spec.label}" braucht mindestens einen \`reply(…)\`-Turn.`);
  }

  // Defaults des Falls + Overrides des Turns zu einem Call auflösen (einmal beim Bauen,
  // damit Schema-Fehler sofort auffallen und nicht erst im N-ten Lauf).
  const callOf = (r: ReplySpec<unknown>, i: number): ResolvedCall =>
    resolveCall(
      {
        schema: r.schema ?? spec.schema,
        structured: r.structured ?? spec.structured,
        body: { ...spec.body, ...r.body },
      },
      `chatCase "${spec.label}" › reply ${r.label ?? i + 1}`,
    );
  const calls = replies.map((t, i) => callOf(t.spec, i));

  const core: Checks<ChatRun> = { ...resultChecks(spec.core as Checks<never> | undefined) };
  const soft: Checks<ChatRun> = { ...resultChecks(spec.soft as Checks<never> | undefined) };
  replies.forEach((t, i) => {
    const label = t.spec.label ?? `turn ${i + 1}`;
    Object.assign(core, turnChecks(t.spec.core as Checks<never> | undefined, i, label));
    Object.assign(soft, turnChecks(t.spec.soft as Checks<never> | undefined, i, label));
  });

  // Die Assertions oben sind bereits auf den ChatRun umgebogen; nach außen tritt der
  // Fall als EvalCase<TLast> auf (siehe Doc-Kommentar) — daher der Cast am Ende.
  const evalCase: EvalCase<ChatRun> = {
    label: spec.label,
    // Report-Kopf: der volle Verlauf steht ohnehin im Request-Mitschnitt jedes Calls.
    input: spec.system ? `system: ${spec.system.slice(0, 200)}…` : '',
    core,
    soft,
    run: async (config: LlmConfig): Promise<ChatRun> => {
      const messages: ChatMessage[] = spec.system ? [{ role: 'system', content: spec.system }] : [];
      const turns: ChatRun['turns'] = [];
      const outputs: unknown[] = [];
      let lastText = '';
      let replyIndex = 0;

      for (const turn of spec.turns) {
        const ctx: TurnContext = { messages, outputs, last: outputs.at(-1), lastText };

        if (turn.kind === 'message') {
          const content = typeof turn.content === 'function' ? turn.content(ctx) : turn.content;
          messages.push({ role: turn.role, content });
          continue;
        }

        const i = replyIndex++;
        const call = calls[i];
        const r = turn.spec;
        const label = r.label ?? `turn ${i + 1}`;

        // Prompt-Modus im Verlauf: die Schema-Instruktion hängt an der LETZTEN
        // User-Nachricht (nicht am System-Prompt) — so gilt sie genau für diesen Turn
        // und spätere Turns mit anderem Schema kollidieren nicht. Steht dieselbe
        // Instruktion schon im Verlauf (Folge-Turn mit gleichem Schema), bleibt sie
        // dort und wird nicht wiederholt.
        if (call.mode === 'prompt' && call.jsonSchema) {
          const suffix = jsonOutputInstruction(call.jsonSchema);
          if (!messages.some((m) => m.content.includes(suffix))) {
            const lastUser = [...messages].reverse().find((m) => m.role === 'user');
            if (lastUser) lastUser.content += suffix;
            else messages.push({ role: 'user', content: suffix.trimStart() });
          }
        }

        const { content } = await rawChatCompletion(
          withOverrides(config, { temperature: r.temperature ?? spec.temperature, maxTokens: r.maxTokens ?? spec.maxTokens }),
          messages,
          call.body,
          { label: r.callLabel ?? spec.callLabel ?? label },
        );
        // Die echte Antwort wird Teil des Verlaufs — der nächste Turn sieht sie.
        messages.push({ role: 'assistant', content });
        lastText = content;

        const data = parseAnswer(content, call);
        outputs.push(data);
        turns.push({ label, text: content, data });
      }

      return { result: outputs.at(-1), turns };
    },
  };
  return evalCase as unknown as EvalCase<TLast>;
}
