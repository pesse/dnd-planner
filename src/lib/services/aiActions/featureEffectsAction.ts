/**
 * Deutung neu gewonnener Merkmale/Talente: aus der Regelprosa die mechanischen Effekte
 * („Rider"), die erzwungenen Spielerwahlen und je Merkmal eine `sheetNote` fürs PDF.
 *
 * ZWEI Calls mit Checkpoint dazwischen, damit der User direkt nach der Analyse entscheidet:
 * `analyzeFeatureEffects` (Reasoning, bewusst ohne Rider-Vokabular) → der Flow zeigt die
 * Choices → `finalizeFeatureEffects` (Nach-Analyse im Verlauf + Grounding + Guided).
 * QM-only, Prompts englisch (`featureEffectsPrompts.ts`).
 *
 * Ein Detail trägt die Qualität messbar (evals/featureAnalysis.eval.test.ts): die
 * getroffenen Wahlen kommen als eigener Folge-Turn statt im Erst-Prompt.
 */
import { featureEffectsJsonSchema, parseFeatureEffects, type FeatureEffects } from '../../schemas/levelUp';
import { translateChoices, translateSheetNotes, type TranslationSource } from './featureTranslationAction';
import type { LlmConfig } from '../../types';
import type { ChatMessage } from '../vaultTools';
import { TASK_TEMPERATURE } from '../vaultTools';
import { qualitymindsChat, qualitymindsGenerateStructuredFromMessages } from '../llm/openAiCompatible';
import type { PastChoice } from '../characterFeatures';
import { chosenOption } from '../declaration/optionList';
import {
  choiceLabelsDe,
  optionLabel,
  type AnalysisChoice,
  type FeatureClassContext,
  type GainedFeature,
  type ResolvedChoice,
} from '../analysis/types';
import {
  FEATURE_EFFECTS_ANALYSIS_SYSTEM,
  FEATURE_EFFECTS_SYSTEM,
  buildFeatureEffectsInput,
  buildResolvedChoicesTurn,
} from './featureEffectsPrompts';
export { FEATURE_EFFECTS_ANALYSIS_SYSTEM, buildFeatureEffectsInput, buildResolvedChoicesTurn };
import { normalizeChoice, parseManifest, type EffectsManifest } from './featureEffectsManifest';
import {
  buildSpellResolution,
  buildTranscriptionInstruction,
  declaredBranchSpells,
  withoutDeclaredSpells,
} from './featureEffectsGrounding';

export interface FeatureEffectsContext {
  classContext: FeatureClassContext;
  features: GainedFeature[];
  pastChoices?: PastChoice[]; // schon festgelegte Wahlen früherer Stufen
  resolvedChoices?: ResolvedChoice[]; // nur für finalizeFeatureEffects
}

export interface FeatureEffectsRunOptions {
  onActivity?: () => void; // Lebenszeichen pro Streaming-Delta (Stuck-Erkennung der UI)
  signal?: AbortSignal;
  /** Für Prompt-Evals true: sonst kaschiert der Retry die First-Try-Qualität des Prompts. */
  noRetry?: boolean;
}


export interface FeatureAnalysis {
  choices: AnalysisChoice[];
  spellsToGround: string[];
  blocked: boolean;
  analysisText: string; // rohe Pass-A-Prosa, geht so an Pass C
}

/** Die Merkmale als Quelle für die Übersetzer (deutsche Felder inklusive). */
function translationSources(features: GainedFeature[]): TranslationSource[] {
  return features.map((f) => ({ name: f.name, nameDe: f.nameDe, desc: f.desc, descDe: f.descDe, key: f.key }));
}

/**
 * T1 anhängen: die deutschen Anzeige-Texte der Wahlen. Ein Fehlschlag ist hier kein
 * Fehler, sondern ein unübersetzter Checkpoint (siehe `featureTranslationAction`).
 */
async function withGermanChoices(
  config: LlmConfig,
  raw: AnalysisChoice[],
  features: GainedFeature[],
  opts: FeatureEffectsRunOptions,
): Promise<AnalysisChoice[]> {
  // Zauber-Wahlen tragen keine Optionslabels; ihre Frage bleibt dennoch anzeigepflichtig.
  if (!raw.length) return raw;

  // Der Merkmalsname ist keine Übersetzungsaufgabe: er steht deutsch in der Bibliothek.
  const nameDeByKey = new Map(features.filter((f) => f.key).map((f) => [f.key!, f.nameDe || f.name]));
  const choices = raw.map((c) => ({ ...c, featureDe: nameDeByKey.get(c.featureKey) || c.feature }));
  const translations = await translateChoices(
    config,
    {
      choices: choices.map((c) => ({
        id: c.id,
        featureKey: c.featureKey,
        question: c.question,
        help: c.help,
        options: c.options,
        optionHelp: c.optionHelp,
      })),
      features: translationSources(features),
    },
    { signal: opts.signal },
  );
  return choices.map((c) => {
    const t = translations.get(c.id);
    return t ? { ...c, questionDe: t.questionDe, helpDe: t.helpDe, optionsDe: t.optionsDe, optionHelpDe: t.optionHelpDe } : c;
  });
}

/** QM-only, weil der Pfad Reasoning + Grounding + Guided Output in einem Verlauf braucht. */
function guardQualityMinds(config: LlmConfig): void {
  if (config.provider !== 'qualityminds')
    throw new Error(
      'Merkmals-Effekte laufen nur über den QualityMinds-Pfad (Reasoning + Grounding + Structured). ' +
        'Bitte ein QualityMinds-Modell wählen.',
    );
}

/**
 * `turns` ist der Analyse-Verlauf OHNE System-Prompt.
 *
 * THINKING-FREI: dieser Call findet Entscheidungen, dafür kauft der Vorlauf nichts (gemessen
 * 2026-07-30, alle drei Strecken halbiert, keine Assertion verloren — Zahlen in
 * `docs/plan/plan-zauberwirker-vereinfachung.md`). Ohne Vorlauf entfällt auch der Runaway (leerer
 * `content` bei `finish_reason: "length"`); der zweite Versuch bleibt als Netz für eine leere
 * Antwort aus anderem Grund. Festgenagelt in `tests/unit/featureAnalysisCall.test.ts`.
 */
async function reason(
  config: LlmConfig,
  turns: ChatMessage[],
  opts: FeatureEffectsRunOptions,
  attempt = 1,
): Promise<{ text: string; manifest: EffectsManifest }> {
  const text = await qualitymindsChat(
    config,
    [{ role: 'system', content: FEATURE_EFFECTS_ANALYSIS_SYSTEM }, ...turns],
    TASK_TEMPERATURE.structured,
    () => opts.onActivity?.(),
    opts.signal,
    // Der Denk-Kanal bleibt verdrahtet, obwohl unten abgeschaltet wird: ignoriert ein
    // Server-Build den Schalter, sieht die Oberfläche Aktivität statt Stillstand.
    () => opts.onActivity?.(),
    // Thinking-frei — siehe Doktrin oben. Der Schalter gilt NUR für diesen Call.
    true,
  );
  if (!text.trim()) {
    // `noRetry` ist der Eval-Schalter: dort soll der Ausfall sichtbar bleiben, sonst
    // kaschiert der zweite Versuch die First-Try-Qualität des Prompts.
    if (attempt === 1 && !opts.noRetry) return reason(config, turns, opts, attempt + 1);
    throw new Error(
      'Die Merkmals-Analyse kam zweimal leer zurück — das Modell hat sein Antwort-Budget ' +
        'vollständig im Reasoning-Vorlauf verbraucht. Ein weiterer Versuch hilft meist; ' +
        'andernfalls „Max. Tokens" in den LLM-Einstellungen erhöhen (Richtwert: 16384).',
    );
  }
  return { text, manifest: parseManifest(text) };
}

/**
 * Call 1 — der Flow zeigt den Entscheidungs-Checkpoint direkt danach; die Übersetzung der
 * Wahlen hängt deshalb hier dran und nicht erst im Flow: sonst müsste jeder Aufrufer sie
 * selbst anstoßen und der Checkpoint könnte unübersetzt aufgehen.
 */
export async function analyzeFeatureEffects(
  config: LlmConfig,
  ctx: FeatureEffectsContext,
  opts: FeatureEffectsRunOptions = {},
): Promise<FeatureAnalysis> {
  guardQualityMinds(config);
  const input = buildFeatureEffectsInput(ctx);
  const { text, manifest } = await reason(config, [{ role: 'user', content: input }], opts);
  const choices = await withGermanChoices(config, manifest.choices, ctx.features, opts);
  return { choices, spellsToGround: manifest.spellsToGround, blocked: manifest.blocked, analysisText: text };
}

/**
 * Call 2 — Nach-Analyse + Grounding + Pass C ins Rider-Schema, dann die deutsche Grenze
 * (Wahl-Protokolle deterministisch, Bogen-Notizen per Übersetzungs-Call).
 *
 * Der Verlauf aus Call 1 wird FORTGESCHRIEBEN statt neu aufgebaut, weil erst die
 * Nach-Analyse auf demselben Verlauf choice-abhängige Zauber benennen kann. Ohne
 * getroffene Wahl entfällt sie und spart einen Reasoning-Call.
 *
 * Die Übersetzung sitzt bewusst HIER und nicht beim Aufrufer: beide Flows und die
 * Eval-Strecke sehen damit denselben fertigen, deutschen Rider.
 */
export async function finalizeFeatureEffects(
  config: LlmConfig,
  ctx: FeatureEffectsContext,
  analysis: FeatureAnalysis,
  opts: FeatureEffectsRunOptions = {},
): Promise<FeatureEffects> {
  guardQualityMinds(config);
  const input = buildFeatureEffectsInput(ctx);

  // Beim Direkteinstieg in die Finalisierung fehlt die Analyse und wird nachgeholt —
  // der Wahl-Turn braucht die Choice-ids aus ihrem Manifest.
  let text = analysis.analysisText.trim();
  let manifest: EffectsManifest = {
    choices: analysis.choices,
    spellsToGround: analysis.spellsToGround,
    blocked: analysis.blocked,
  };
  if (!text) ({ text, manifest } = await reason(config, [{ role: 'user', content: input }], opts));

  const turns: ChatMessage[] = [
    { role: 'user', content: input },
    { role: 'assistant', content: text },
  ];

  if (ctx.resolvedChoices?.length) {
    const answerTurn = buildResolvedChoicesTurn(ctx.resolvedChoices);
    const after = await reason(config, [...turns, { role: 'user', content: answerTurn }], opts);
    turns.push({ role: 'user', content: answerTurn }, { role: 'assistant', content: after.text });
    manifest = after.manifest;
  }

  // Bei offener Wahl gibt es noch nichts zu erden. Und was die getroffene Zweigwahl schon
  // gewährt, wird nicht geerdet: `<spell_resolution>` ist die Aufforderung, genau diese Namen
  // in `grantedSpells` zu setzen — gemessen der Auslöser der Dublette (evals/unredactedChoice).
  const declaredSpells = declaredBranchSpells(ctx.features);
  const spellResolution = manifest.blocked
    ? ''
    : await buildSpellResolution(
        manifest.spellsToGround.filter((s) => !declaredSpells.has(s.trim().toLowerCase())),
        ctx.classContext.klasseName,
      );

  // Namentlich, nicht als Regel: nur diese Merkmale tragen eine schon getroffene Zweigwahl.
  const settled = ctx.features.filter((f) => f.choice && chosenOption(f, f.choice)).map((f) => f.name);
  const messages: ChatMessage[] = [
    { role: 'system', content: FEATURE_EFFECTS_SYSTEM },
    ...turns,
    { role: 'user', content: buildTranscriptionInstruction(spellResolution, settled) },
  ];

  const runPassC = async (): Promise<FeatureEffects | null> => {
    try {
      const raw = await qualitymindsGenerateStructuredFromMessages(config, messages, featureEffectsJsonSchema, {
        signal: opts.signal,
      });
      return parseFeatureEffects(raw);
    } catch (e) {
      if (opts.signal?.aborted) throw e; // Abbruch nie verschlucken
      return null;
    }
  };

  let result = await runPassC();
  if (!result && !opts.noRetry) result = await runPassC();
  if (!result) throw new Error('Die KI lieferte keine schema-validen Merkmals-Effekte.');

  // Beim Direkteinstieg trägt nur das nachgeholte Manifest die Wahlen (dann ohne Übersetzung).
  const choiceList = analysis.choices.length ? analysis.choices : manifest.choices;
  const withDecisions = fillDecisions(withoutDeclaredSpells(result, declaredSpells), choiceList, ctx.resolvedChoices ?? []);
  return germanizeSheetNotes(config, withDecisions, ctx.features, choiceList, opts);
}

/**
 * Frage und Antwort der protokollierten Wahlen deterministisch nachtragen — beide stehen
 * schon auf Deutsch in der Analyse bzw. in der Antwort des Spielers. Das Modell danach zu
 * fragen hieße, dieselbe Zeichenkette ein zweites Mal erzeugen zu lassen; genau dabei drifteten
 * Frage und Label früher auseinander.
 */
function fillDecisions(effects: FeatureEffects, choices: AnalysisChoice[], resolved: ResolvedChoice[]): FeatureEffects {
  if (!resolved.length) return effects;
  const byId = new Map(choices.map((c) => [c.id, c]));
  const answerById = new Map(resolved.map((r) => [r.id, r.choice]));
  return {
    ...effects,
    riders: effects.riders.map((rider) => ({
      ...rider,
      decisions: rider.decisions.map((d) => {
        const choice = byId.get(d.id);
        const answerEn = answerById.get(d.id) ?? d.answer;
        return {
          id: d.id,
          question: choice?.questionDe.trim() || choice?.question || d.question,
          // Die Antwort kommt als englischer Wert zurück; angezeigt wird das Options-Label.
          answer: choice ? choiceLabelsDe(choice, answerEn) : answerEn,
        };
      }),
    })),
  };
}

/** T2 anhängen: deutsche Bogen-Notizen. Bei Fehlschlag bleibt die englische Zeile stehen. */
async function germanizeSheetNotes(
  config: LlmConfig,
  effects: FeatureEffects,
  features: GainedFeature[],
  choices: AnalysisChoice[],
  opts: FeatureEffectsRunOptions,
): Promise<FeatureEffects> {
  const notes = effects.riders
    .map((r, index) => ({ index, featureKey: r.featureKey, featureName: r.featureName, note: r.sheetNote.trim() }))
    .filter((n) => n.note);
  if (!notes.length) return effects;

  // Die Options-Paare der Wahlen als feste Begriffe: eine Notiz nennt die getroffene Wahl
  // („Magic Initiate (Wizard)"), und ohne dieses Paar wird daraus „Zauberer" statt „Magier".
  const terms = choices.flatMap((c) =>
    c.options.map((en, i) => ({ en, de: optionLabel(c, i) })).filter((t) => t.de && t.de !== t.en),
  );
  const translated = await translateSheetNotes(
    config,
    { notes, features: translationSources(features), terms },
    { signal: opts.signal },
  );
  if (!translated.size) return effects;
  return {
    ...effects,
    riders: effects.riders.map((rider, index) => {
      const de = translated.get(index);
      return de ? { ...rider, sheetNote: de } : rider;
    }),
  };
}
