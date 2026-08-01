/**
 * Distanz-Umrechnung imperial → metrisch (D&D 5e DE, SRD 5.2.1). Deterministisch und
 * damit bewusst KEINE LLM-Aufgabe; den Fuß-Faktor liefert `ftToMVal`, damit App-Rendering
 * und Umrechnung nicht auseinanderlaufen.
 */
import { ftToMVal } from '../itemFormat';

const MI_TO_KM = 1.6;

const FEET_UNITS = /^(feet|foot|ft|fuß)$/i;
const MILE_UNITS = /^(miles?|meilen?)$/i;

// Abschluss via Negative-Lookahead statt \b: ß ist in JS kein Wortzeichen, \b greift
// hinter „Fuß" nicht. So matcht „40 Fuß." und „footnote" bleibt außen vor.
const DISTANCE_RE = /(\d+(?:[.,]\d+)?)[\s-]*(feet|foot|ft|fuß|miles|mile|meilen|meile)(?![a-zäöüß])/gi;

function formatDe(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

function toMetric(numStr: string, unit: string): string | null {
  const value = parseFloat(numStr.replace(',', '.'));
  if (FEET_UNITS.test(unit)) return `${formatDe(ftToMVal(value))} Meter`;
  if (MILE_UNITS.test(unit)) return `${formatDe(value * MI_TO_KM)} Kilometer`;
  return null;
}

export interface ImperialMatch {
  /** Originaltext, z.B. „40-foot". */
  original: string;
  /** Metrische deutsche Entsprechung, z.B. „12 Meter". */
  metric: string;
}

export function findImperial(text: string): ImperialMatch[] {
  const out: ImperialMatch[] = [];
  for (const m of text.matchAll(DISTANCE_RE)) {
    const metric = toMetric(m[1], m[2]);
    if (metric) out.push({ original: m[0], metric });
  }
  return out;
}

export function convertDistances(text: string): string {
  return text.replace(DISTANCE_RE, (full, num, unit) => toMetric(num, unit) ?? full);
}
