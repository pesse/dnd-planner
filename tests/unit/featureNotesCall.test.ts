/**
 * Die Form des Notiz-Calls — des einzigen KI-Calls, der Merkmale noch liest: guided, dadurch
 * thinking-frei, mit Lebenszeichen und einem zweiten Versuch bei leerer Antwort.
 *
 * Ohne LLM — außerhalb von Tauri geht `httpFetch` aufs globale `fetch`, das hier gestubt wird.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  summarizeFeatureNotes,
  type FeatureNotesContext,
} from '../../src/lib/services/aiActions/featureNotesAction';
import { featureNotesJsonSchema } from '../../src/lib/schemas/levelUp';
import { qualitymindsChat } from '../../src/lib/services/llm/openAiCompatible';
import type { LlmConfig } from '../../src/lib/types';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Ein SSE-Body, wie der Server ihn streamt (`data: …` je Frame, abschließendes [DONE]). */
function sse(...frames: Record<string, unknown>[]): string {
  return frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
}

/** Eine Antwort mit sichtbarem Inhalt. */
const answer = (content: string): string =>
  sse(
    { choices: [{ delta: { content }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } },
  );

/** Der Ausfall: NUR Denk-Vorlauf, kein Inhalt, Budget erschöpft (`length`). */
const emptyAfterThinking = (): string =>
  sse(
    { choices: [{ delta: { reasoning: 'Ich denke noch nach …' }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 300 } },
  );

/** Stubt `fetch`, gibt die Bodies der Reihe nach zurück (der letzte wiederholt sich). */
function stubFetch(bodies: string[]): Record<string, unknown>[] {
  const sent: Record<string, unknown>[] = [];
  let i = 0;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof fetch;
  return sent;
}

const config = (): LlmConfig =>
  ({ provider: 'qualityminds', apiKey: 'test-key', model: 'test-model' }) as LlmConfig;

const FEATURE_KEY = 'srd-2024_circle-of-the-land_lands-aid';

const ctx = (): FeatureNotesContext => ({
  classContext: {
    klasseName: 'Druide',
    subclassName: 'Zirkel des Landes',
    casterType: 'FULL',
    casterKind: 'prepared',
    spellcastingAbility: 'wei',
    toLevel: 3,
  },
  features: [
    {
      name: "Land's Aid",
      nameDe: 'Beistand des Landes',
      desc: 'As a Magic action, you can expend a use of Wild Shape to cast Cure Wounds.',
      source: 'subclass',
      gainedAt: 3,
      key: FEATURE_KEY,
    },
  ],
});

const notesBody = (sheetNote: string): string =>
  JSON.stringify({ notes: [{ featureName: "Land's Aid", featureKey: FEATURE_KEY, sheetNote }] });

/** Leere Notiz heißt „braucht keine Zeile" — und der Übersetzungs-Call bleibt aus. */
const NO_NOTE = notesBody('');

const thinkingKwargs = (body: Record<string, unknown>): unknown =>
  (body.chat_template_kwargs as Record<string, unknown> | undefined)?.enable_thinking;

describe('Form des Notiz-Calls', () => {
  it('geht guided raus und schaltet damit den Denk-Vorlauf ab', async () => {
    const sent = stubFetch([answer(NO_NOTE)]);
    await summarizeFeatureNotes(config(), ctx(), { noRetry: true });

    expect(sent).toHaveLength(1);
    expect(sent[0].structured_outputs).toEqual({ json: featureNotesJsonSchema });
    // Auf diesem Server greift guided decoding nur ohne Vorlauf — der Schalter hängt am Schema.
    expect(thinkingKwargs(sent[0])).toBe(false);
  });

  it('lässt jedem anderen Chat seinen Denk-Vorlauf', async () => {
    const sent = stubFetch([answer('hallo')]);
    await qualitymindsChat(config(), [{ role: 'user', content: 'hi' }]);

    expect(sent).toHaveLength(1);
    expect(thinkingKwargs(sent[0])).toBeUndefined();
  });

  it('meldet Lebenszeichen je Inhalts-Delta', async () => {
    stubFetch([answer(NO_NOTE)]);
    let activity = 0;
    await summarizeFeatureNotes(config(), ctx(), { noRetry: true, onActivity: () => activity++ });

    expect(activity).toBeGreaterThan(0);
  });

  it('schickt eine gefüllte Notiz durch die deutsche Grenze', async () => {
    const noteDe = 'Beistand des Landes: Tiergestalt-Nutzung, um Wunden heilen zu wirken.';
    const sent = stubFetch([
      answer(notesBody("Land's Aid: spend a Wild Shape use to cast Cure Wounds.")),
      answer(JSON.stringify({ notes: [{ index: 0, noteDe }] })),
    ]);
    const notes = await summarizeFeatureNotes(config(), ctx(), { noRetry: true });

    expect(sent).toHaveLength(2);
    expect(notes[0].sheetNote).toBe(noteDe);
  });
});

describe('Leere Antwort des Notiz-Passes', () => {
  it('meldet im Eval-Pfad (noRetry) sofort', async () => {
    const sent = stubFetch([emptyAfterThinking()]);
    const err = await summarizeFeatureNotes(config(), ctx(), { noRetry: true }).then(
      () => null,
      (e: Error) => e,
    );

    expect(sent).toHaveLength(1); // genau ein Versuch — sonst kaschiert er die Prompt-Qualität
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/schema-valide/);
  });

  it('versucht es im App-Pfad ein zweites Mal', async () => {
    const sent = stubFetch([emptyAfterThinking()]);
    const err = await summarizeFeatureNotes(config(), ctx(), {}).then(
      () => null,
      (e: Error) => e,
    );

    expect(sent).toHaveLength(2);
    expect(err).toBeInstanceOf(Error);
  });

  it('nimmt den zweiten Versuch als Ergebnis, wenn er trägt', async () => {
    const sent = stubFetch([emptyAfterThinking(), answer(NO_NOTE)]);
    const notes = await summarizeFeatureNotes(config(), ctx(), {});

    expect(sent).toHaveLength(2);
    expect(notes.map((n) => n.featureKey)).toEqual([FEATURE_KEY]);
  });
});
