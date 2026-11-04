/**
 * Auswahlregeln der Zufallsfüllung, rein und mit eingespeistem Zufall. Gewürfelt wird nur
 * unter gültigen Optionen; wo eine Regel „sinnvoll" kennt, gewichtet sie danach.
 */
import { SKILL_DEFS } from '$lib/domain/skills';
import type { AnalysisChoice } from '../analysis/types';
import type { AbilityScores } from './pointBuy';

/** Liefert Werte in [0, 1) wie `Math.random`. */
export type Rng = () => number;

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const pickOne = <T>(items: readonly T[], rng: Rng): T | undefined =>
  items.length ? items[Math.floor(rng() * items.length)] : undefined;

/**
 * Ergänzt `current` bis `count` aus `ranked`, in dessen Reihenfolge. Was schon gewählt ist,
 * bleibt — die Füllung überschreibt nie eine Wahl des Spielers.
 */
export function topUp<T>(current: readonly T[], ranked: readonly T[], count: number): T[] {
  const out = [...current];
  for (const c of ranked) {
    if (out.length >= count) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** Bevorzugte zuerst (gemischt), dann der Rest (gemischt). */
export const preferring = <T>(items: readonly T[], preferred: (item: T) => boolean, rng: Rng): T[] => [
  ...shuffled(items.filter(preferred), rng),
  ...shuffled(items.filter((i) => !preferred(i)), rng),
];

/**
 * Fertigkeiten nach dem Wert ihres Attributs. Der Zufallsanteil mischt nur nahe Werte —
 * eine Fertigkeit auf dem Hauptattribut schlägt eine auf dem Abwurfwert immer.
 */
export function rankSkills(skills: readonly string[], scores: AbilityScores, rng: Rng): string[] {
  const attrOf = new Map<string, keyof AbilityScores>(SKILL_DEFS.map((d) => [d.en, d.attr as keyof AbilityScores]));
  const weight = new Map(skills.map((s) => {
    const attr = attrOf.get(s);
    return [s, (attr ? scores[attr] : 10) + rng() * 3] as const;
  }));
  return [...skills].sort((a, b) => weight.get(b)! - weight.get(a)!);
}

/** Antwort auf eine Merkmalswahl; leer, wo es nichts zu würfeln gibt (Freitext). */
export function randomChoiceAnswer(choice: AnalysisChoice, rng: Rng): string[] {
  if (choice.type === 'text' || choice.type === 'spell-pick' || !choice.options.length) return [];
  const count = choice.type === 'multiselect' ? Math.max(1, choice.max) : 1;
  return shuffled(choice.options, rng).slice(0, count);
}
