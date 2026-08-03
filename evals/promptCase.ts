/**
 * Prompt-Werkstatt: rohe Prompts messen, ohne dass es dafür schon eine `AiAction` gibt.
 * `promptCase` ist EIN Call, `chatCase` ein ganzer Verlauf, in dem jede Live-Antwort dem
 * nächsten Turn zur Verfügung steht. Beide liefern einen normalen `EvalCase`.
 *
 * Beide gehen über dieselbe Transport-Schicht wie die App (`rawChatCompletion`) — mit
 * Streaming, Rate-Limit-Retry, Token-Zählung und dem Mitschnitt, den der Report ausliest.
 */
import { z } from 'zod';
import type { LlmConfig } from '../src/lib/types';
import type { ChatMessage } from '../src/lib/services/vaultTools';
import { rawChatCompletion } from '../src/lib/services/llm/openAiCompatible';
import { jsonOutputInstruction } from '../src/lib/services/aiActions/runner';
import { toLlmJsonSchema } from '../src/lib/schemas/llmJson';
import { extractJson, stripJsonFence } from '../src/lib/services/jsonFence';
import type { Checks, EvalCase } from './defineEval';

/**
 * Wie das Schema an den Server geht:
 *  - `'native'` (Default mit Schema) — vllm guided decoding; erzwingt zusätzlich
 *    `enable_thinking:false`, weil die Grammatik sonst nicht greift.
 *  - `'prompt'` — Schema nur als Instruktion, im Wortlaut des Runners; tolerant geparst.
 *  - `'parse'` — Request unverändert, Schema nur zum Parsen. Richtig, wenn der Prompt das
 *    Format schon selbst beschreibt, sonst stünde die Vorgabe doppelt drin.
 *  - `'off'` — kein JSON, das Ergebnis ist der rohe Antworttext.
 */
export type StructuredMode = 'native' | 'prompt' | 'parse' | 'off';

/** Gemeinsame Server-Stellschrauben von `promptCase` und einem Live-Turn. */
interface CallOptions {
  /** Zod-Schema validiert das Ergebnis mit (Verstoß = Fehlschlag); ein JSON-Schema nicht. */
  schema?: z.ZodType | object;
  /** Default: `'native'` mit Schema, sonst `'off'`. */
  structured?: StructuredMode;
  /** Ohne Angabe wird KEINE mitgeschickt — anders als die Action-Pfade mit `TASK_TEMPERATURE`. */
  temperature?: number;
  /** Antwort-Budget dieses Calls (sonst EVAL_MAX_TOKENS). */
  maxTokens?: number;
  /**
   * Weitere Body-Properties für `/chat/completions`; gewinnen gegen alles andere, damit
   * jeder Server-Parameter messbar ist, bevor er in die App wandert.
   */
  body?: Record<string, unknown>;
  /** Label des Calls im Report-Mitschnitt (Default: 'eval-prompt'). */
  callLabel?: string;
}

const isZod = (s: unknown): s is z.ZodType =>
  !!s && typeof (s as { safeParse?: unknown }).safeParse === 'function';

const snippet = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

interface ResolvedCall {
  mode: StructuredMode;
  jsonSchema?: object;
  zodSchema?: z.ZodType;
  /** Body-Anteil, der aus Schema-Modus + `body` entsteht. */
  body: Record<string, unknown>;
}

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
 * Bevorzugt den LETZTEN ```json-Block, wie `parseManifest` in der Produktion: ein
 * Beispiel-Block mitten im Text darf das abschließende Ergebnis nicht verdrängen.
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

/** Strikt bei nativem Schema, sonst tolerant. */
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

const withOverrides = (config: LlmConfig, opts: CallOptions): LlmConfig => ({
  ...config,
  ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
  ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
});

export interface PromptSpec<T> extends CallOptions {
  /** Anzeigename des Falls im Report. */
  label: string;
  /** Das, was in einer Action `buildSystemPrompt()` wäre. */
  system?: string;
  user?: string;
  /** Voller Verlauf statt `system`/`user`. Für echte Turns: `chatCase`. */
  messages?: ChatMessage[];
  /** Muss-Assertions (gaten den Schwellwert). */
  core?: Checks<T>;
  /** Kann-Assertions (nur berichtet). */
  soft?: Checks<T>;
}

/**
 * `T` ist bei `structured: 'off'` der Antworttext, sonst das geparste JSON — explizit
 * angeben (`promptCase<Npc>({…})`) oder aus dem Zod-Schema ableiten.
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
  // Schema-Instruktion in den System-Prompt, wie im emulierten Runner-Pfad — sonst trägt
  // der Vergleich zur Produktion nicht.
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
  /** Im Report-Mitschnitt und als Präfix der Assertions dieses Turns. */
  label?: string;
  /** Assertions auf dem Ergebnis DIESES Turns. */
  core?: Checks<T>;
  soft?: Checks<T>;
}


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

export interface ChatRun {
  /** Geparstes Ergebnis des LETZTEN Live-Turns. */
  result: unknown;
  turns: { label: string; text: string; data: unknown }[];
}

export interface ChatSpec<TLast> extends CallOptions {
  /** Anzeigename des Falls im Report. */
  label: string;
  system?: string;
  /** In Reihenfolge — `user(…)`, `assistant(…)`, `reply(…)`. */
  turns: Turn[];
  /** Assertions auf dem Ergebnis des LETZTEN Live-Turns. */
  core?: Checks<TLast>;
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

function resultChecks(checks: Checks<never> | undefined): Checks<ChatRun> {
  const out: Checks<ChatRun> = {};
  for (const [name, check] of Object.entries(checks ?? {})) {
    out[name] = (run) => (check as (v: unknown) => boolean)(run.result);
  }
  return out;
}

/**
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
 * });
 * ```
 * Ein `assistant('…')` statt des ersten `reply(…)` gibt den Zwischenschritt als Fixture vor —
 * deterministisch, ein Call weniger. Optionen am Fall sind Defaults aller Live-Turns.
 *
 * Der Rückgabetyp ist `EvalCase<TLast>`, damit Chat- und Ein-Call-Fälle in EINEM
 * `defineEval<T>` stehen können; zur Laufzeit ist das Ergebnis der volle `ChatRun`.
 */
export function chatCase<TLast = unknown>(spec: ChatSpec<TLast>): EvalCase<TLast> {
  const replies = spec.turns.filter((t): t is Extract<Turn, { kind: 'reply' }> => t.kind === 'reply');
  if (replies.length === 0) {
    throw new Error(`[eval] chatCase "${spec.label}" braucht mindestens einen \`reply(…)\`-Turn.`);
  }

  // Einmal beim Bauen auflösen, damit ein Schema-Fehler sofort auffällt und nicht im N-ten Lauf.
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

  // Die Assertions sind bereits auf den ChatRun umgebogen, nach außen tritt der Fall als
  // EvalCase<TLast> auf — daher der Cast am Ende.
  const evalCase: EvalCase<ChatRun> = {
    label: spec.label,
    // Nur der Report-Kopf; der volle Verlauf steht im Request-Mitschnitt jedes Calls.
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
