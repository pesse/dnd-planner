/** Bewegungsarten und Sinne eines Charakters, aus `grants.speeds`/`grants.senses` seiner Merkmale. */
import type { FeatureGrant } from '../schemas/grants';
import type { SenseEffect, SenseKind, SpeedEffect, SpeedMode } from '../schemas/movement';
import { SENSE_KINDS, SPEED_MODES } from '../schemas/movement';
import { ftToMVal } from '../itemFormat';
import { featureIdOf } from '../utils/text';
import { MOVEMENT_LABELS, SENSE_LABELS } from './monsterFormat';

export interface MovementFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
}

export interface MovementLine {
  labelDe: string;
  valueDe: string;
  /** Die Merkmale, aus denen der Wert folgt. */
  sourcesDe: string[];
  /** Leer = gilt immer. */
  whenDe: string;
}

const MODE_DE: Record<SpeedMode, string> = { walk: 'Bewegungsrate', ...MOVEMENT_LABELS };

type Sourced<T> = { labelDe: string; effect: T };

function collect(features: readonly MovementFeature[]): { speeds: Sourced<SpeedEffect>[]; senses: Sourced<SenseEffect>[] } {
  const seen = new Set<string>();
  const speeds: Sourced<SpeedEffect>[] = [];
  const senses: Sourced<SenseEffect>[] = [];
  for (const f of features) {
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    speeds.push(...(f.grants?.speeds ?? []).map((effect) => ({ labelDe: f.name, effect })));
    senses.push(...(f.grants?.senses ?? []).map((effect) => ({ labelDe: f.name, effect })));
  }
  return { speeds, senses };
}

/** Mit Komma wie die Bewegungsrate im Kampfblock (`declaredSpeed`). */
const ftToM = (ft: number): string => `${String(ftToMVal(ft)).replace('.', ',')} m`;

const whenOf = (e: { condition?: string; conditionDe?: string }): string => e.conditionDe?.trim() || e.condition?.trim() || '';

/** Ohne bekannte Bewegungsrate bleibt „wie Bewegungsrate" stehen statt einer erfundenen Zahl. */
function speedValueDe(feet: SpeedEffect['feet'], walkFeet: number | null): { feet: number | null; text: string } {
  if (typeof feet === 'number') return { feet, text: ftToM(feet) };
  const factor = feet === 'double-speed' ? 2 : 1;
  if (walkFeet === null) return { feet: null, text: factor === 2 ? 'doppelte Bewegungsrate' : 'wie Bewegungsrate' };
  return { feet: walkFeet * factor, text: ftToM(walkFeet * factor) };
}

function situationalSpeed({ labelDe, effect: e }: Sourced<SpeedEffect>, walkFeet: number | null): MovementLine {
  const value = e.bonus && typeof e.feet === 'number' ? `+${ftToM(e.feet)}` : speedValueDe(e.feet, walkFeet).text;
  return { labelDe: MODE_DE[e.mode], valueDe: value + (e.hover ? ' (schwebend)' : ''), sourcesDe: [labelDe], whenDe: whenOf(e) };
}

/** Feste Werte: der größte gilt, Erhöhungen zählen obendrauf. */
function steadySpeed(mode: SpeedMode, parts: Sourced<SpeedEffect>[], walkFeet: number | null): MovementLine | null {
  if (!parts.length) return null;
  const bonus = parts.filter((p) => p.effect.bonus && typeof p.effect.feet === 'number')
    .reduce((n, p) => n + (p.effect.feet as number), 0);
  const fixed = parts.filter((p) => !p.effect.bonus).map((p) => speedValueDe(p.effect.feet, walkFeet));
  const hover = parts.some((p) => p.effect.hover) ? ' (schwebend)' : '';
  const sourcesDe = [...new Set(parts.map((p) => p.labelDe))];
  // Die Grundbewegungsrate steht im Kampfblock; hier nur, was die Merkmale dazugeben.
  if (mode === 'walk' || !fixed.length) return { labelDe: MODE_DE[mode], valueDe: `+${ftToM(bonus)}`, sourcesDe, whenDe: '' };
  const known = fixed.filter((f) => f.feet !== null).map((f) => f.feet as number);
  const valueDe = known.length
    ? ftToM(Math.max(...known) + bonus)
    : fixed[0].text + (bonus ? ` +${ftToM(bonus)}` : '');
  return { labelDe: MODE_DE[mode], valueDe: valueDe + hover, sourcesDe, whenDe: '' };
}

function steadySense(kind: SenseKind, parts: Sourced<SenseEffect>[]): MovementLine | null {
  if (!parts.length) return null;
  let range = Math.max(0, ...parts.filter((p) => !p.effect.stacks).map((p) => p.effect.feet));
  for (const p of parts.filter((p) => p.effect.stacks)) range = range ? range + p.effect.feet : p.effect.feet;
  return { labelDe: SENSE_LABELS[kind], valueDe: ftToM(range), sourcesDe: [...new Set(parts.map((p) => p.labelDe))], whenDe: '' };
}

/**
 * `walkFeet` ist die Grundbewegungsrate samt dauerhaften Erhöhungen der Merkmale; null, wenn sie
 * unbekannt ist. Erst die dauerhaften Zeilen, dann die an eine Lage gebundenen.
 */
export function characterMovement(features: readonly MovementFeature[], baseWalkFeet: number | null): MovementLine[] {
  const { speeds, senses } = collect(features);
  const steadySpeeds = speeds.filter((s) => !whenOf(s.effect));
  const walkBonus = steadySpeeds.filter((s) => s.effect.mode === 'walk' && s.effect.bonus && typeof s.effect.feet === 'number')
    .reduce((n, s) => n + (s.effect.feet as number), 0);
  const walkFeet = baseWalkFeet === null ? null : baseWalkFeet + walkBonus;
  return [
    ...SPEED_MODES.map((m) => steadySpeed(m, steadySpeeds.filter((s) => s.effect.mode === m), walkFeet)),
    ...SENSE_KINDS.map((k) => steadySense(k, senses.filter((s) => s.effect.sense === k && !whenOf(s.effect)))),
    ...speeds.filter((s) => whenOf(s.effect)).map((s) => situationalSpeed(s, walkFeet)),
    ...senses.filter((s) => whenOf(s.effect)).map(({ labelDe, effect: e }) =>
      ({ labelDe: SENSE_LABELS[e.sense], valueDe: (e.stacks ? '+' : '') + ftToM(e.feet), sourcesDe: [labelDe], whenDe: whenOf(e) })),
  ].filter((l): l is MovementLine => !!l);
}
