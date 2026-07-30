/**
 * Die FORM des Analyse-Calls (`reason()` in featureEffectsAction) — thinking-frei, und was
 * bei leerer Antwort passiert. Ohne LLM: `httpFetch` fällt außerhalb von Tauri auf das globale
 * `fetch` zurück, das hier gestubt wird. Damit ist jede Zusicherung deterministisch statt
 * stochastisch, und der Lauf kostet nichts.
 *
 * Ersetzt `runawayRetry.test.ts` (2026-07-30). Dessen Prämisse war, den Runaway durch ein
 * winziges Token-Budget zu ERZWINGEN: das Modell verbrauchte es im Denk-Vorlauf und lieferte
 * leeren Inhalt. Seit die Analyse thinking-frei läuft, kommt bei knappem Budget abgeschnittener,
 * aber NICHT leerer Inhalt — der Ausfall ist auf diesem Pfad strukturell weg, also ließ sich
 * die alte Prämisse nicht mehr herstellen. Keine Zusicherung ist dabei verloren gegangen: alle
 * drei von damals stehen unten wieder, nur ohne echten Call. Neu hinzu kommt die Zusicherung,
 * dass der Schalter tatsächlich auf der Leitung liegt — genau die Regression, die die halbierte
 * Wartezeit still zurücknehmen würde.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeFeatureEffects, type FeatureEffectsContext } from '../src/lib/services/aiActions/featureEffectsAction';
import { qualitymindsChat } from '../src/lib/services/llmService';
import type { LlmConfig } from '../src/lib/types';

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

const ctx = (): FeatureEffectsContext => ({
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
      key: 'srd-2024_circle-of-the-land_lands-aid',
    },
  ],
  pastChoices: [],
});

/** Ein Manifest ohne Wahlen — dann bleibt der Übersetzungs-Call aus (er hätte nichts zu tun). */
const MANIFEST = 'Prosa.\n```json\n{"choices":[],"spellsToGround":[],"blocked":false}\n```';

const thinkingKwargs = (body: Record<string, unknown>): unknown =>
  (body.chat_template_kwargs as Record<string, unknown> | undefined)?.enable_thinking;

describe('Form des Analyse-Calls', () => {
  it('schaltet den Denk-Vorlauf ab — ohne guided schema', async () => {
    const sent = stubFetch([answer(MANIFEST)]);
    await analyzeFeatureEffects(config(), ctx(), { noRetry: true });

    expect(sent).toHaveLength(1);
    expect(thinkingKwargs(sent[0])).toBe(false);
    // Der Schalter kommt hier NICHT vom guided decoding — Pass A ist ungeguidet.
    expect(sent[0].structured_outputs).toBeUndefined();
  });

  it('lässt jedem anderen Chat seinen Denk-Vorlauf', async () => {
    const sent = stubFetch([answer('hallo')]);
    await qualitymindsChat(config(), [{ role: 'user', content: 'hi' }]);

    expect(sent).toHaveLength(1);
    expect(thinkingKwargs(sent[0])).toBeUndefined();
  });
});

describe('Leere Antwort der Merkmals-Analyse', () => {
  it('meldet im Eval-Pfad (noRetry) sofort, mit der Ursache statt „Budget zu klein"', async () => {
    const sent = stubFetch([emptyAfterThinking()]);
    const err = await analyzeFeatureEffects(config(), ctx(), { noRetry: true }).then(
      () => null,
      (e: Error) => e,
    );

    expect(sent).toHaveLength(1); // genau ein Versuch — sonst kaschiert er die Prompt-Qualität
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/Reasoning-Vorlauf/);
  });

  it('versucht es im App-Pfad ein zweites Mal und hält das Lebenszeichen am Leben', async () => {
    const sent = stubFetch([emptyAfterThinking()]);
    let activity = 0;
    const err = await analyzeFeatureEffects(config(), ctx(), { onActivity: () => activity++ }).then(
      () => null,
      (e: Error) => e,
    );

    expect(sent).toHaveLength(2);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/zweimal leer/);
    // Der Denk-Kanal (`delta.reasoning`) bleibt verdrahtet: schickt ein Server-Build doch
    // einen Vorlauf, sieht die Oberfläche Aktivität statt scheinbaren Stillstands.
    expect(activity).toBeGreaterThan(0);
  });

  it('nimmt den zweiten Versuch als Ergebnis, wenn er trägt', async () => {
    const sent = stubFetch([emptyAfterThinking(), answer(MANIFEST)]);
    const analysis = await analyzeFeatureEffects(config(), ctx(), {});

    expect(sent).toHaveLength(2);
    expect(analysis.analysisText).toContain('Prosa');
    expect(analysis.blocked).toBe(false);
  });
});
