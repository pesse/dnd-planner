/**
 * Kanal für einen Dialog, der eine Frage beantwortet: Store für die offene
 * Anfrage, `ask` liefert das Ergebnis als Promise. Der Dialog wird einmal global
 * gemountet und hängt am Store; das Auflösen schließt ihn.
 */
import { writable, type Readable } from 'svelte/store';

export type PromptRequest<Req, Res> = Req & { resolve: (result: Res) => void };

export interface PromptChannel<Req, Res> {
  prompt: Readable<PromptRequest<Req, Res> | null>;
  ask: (req: Req) => Promise<Res>;
}

export function promptDialog<Req extends object, Res>(): PromptChannel<Req, Res> {
  const prompt = writable<PromptRequest<Req, Res> | null>(null);
  return {
    prompt: { subscribe: prompt.subscribe },
    ask: (req) =>
      new Promise<Res>((resolve) => {
        prompt.set({
          ...req,
          resolve: (result) => {
            prompt.set(null);
            resolve(result);
          },
        } as PromptRequest<Req, Res>);
      }),
  };
}
