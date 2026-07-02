/**
 * Distanz-Umrechnung imperial → metrisch (D&D 5e DE, SRD 5.2.1).
 *
 * KEINE Übersetzung, sondern deterministische Umrechnung — gehört NICHT ins LLM:
 *   - 5 ft = 1,5 m   → Faktor ft × 0,3  („Jedes Quadrat repräsentiert 1,5 Meter")
 *   - 1 mile = 1,6 km → Faktor mi × 1,6 (Reisetempo-Werte im SRD bestätigt)
 *
 * Die Fuß-Umrechnung nutzt `ftToMVal` aus `itemLibrary` (dieselbe 0,3-Konstante
 * und Rundung wie das restliche App-Rendering — Single Source für den Faktor).
 * Erkennt englische (feet/foot/ft, mile/miles) UND deutsche Rest-Einheiten
 * (Fuß, Meile/Meilen), damit auch eine LLM-Ausgabe nachkonvertiert werden kann.
 */
import { ftToMVal } from '../itemLibrary';

const MI_TO_KM = 1.6;

const FEET_UNITS = /^(feet|foot|ft|fuß)$/i;
const MILE_UNITS = /^(miles?|meilen?)$/i;

// Zahl (mit . oder , als Dezimaltrenner) + optionaler Trenner + Einheit.
// Abschluss via Negative-Lookahead statt \b — \b greift nach „ß" (Fuß) nicht,
// da ß in JS kein Wortzeichen ist. So matcht auch „40 Fuß." und „footnote" wird vermieden.
const DISTANCE_RE = /(\d+(?:[.,]\d+)?)[\s-]*(feet|foot|ft|fuß|miles|mile|meilen|meile)(?![a-zäöüß])/gi;

/** Deutsche Zahlformatierung: max. 2 Nachkommastellen, „."→„,", Nullen weg. */
function formatDe(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

/** Wandelt eine einzelne (Zahl, Einheit) in die metrische deutsche Form. */
function toMetric(numStr: string, unit: string): string | null {
  const value = parseFloat(numStr.replace(',', '.'));
  if (FEET_UNITS.test(unit)) return `${formatDe(ftToMVal(value))} Meter`;
  if (MILE_UNITS.test(unit)) return `${formatDe(value * MI_TO_KM)} Kilometer`;
  return null;
}

export interface ImperialMatch {
  /** Der gefundene Originaltext, z.B. „40-foot" oder „40 Fuß". */
  original: string;
  /** Die metrische deutsche Entsprechung, z.B. „12 Meter". */
  metric: string;
}

/**
 * Findet alle imperialen Distanzangaben in `text`.
 * Nutzbar für Pin-Fakten (aus EN-Quelltext) und Lint (aus DE-Ausgabe).
 */
export function findImperial(text: string): ImperialMatch[] {
  const out: ImperialMatch[] = [];
  for (const m of text.matchAll(DISTANCE_RE)) {
    const metric = toMetric(m[1], m[2]);
    if (metric) out.push({ original: m[0], metric });
  }
  return out;
}

/** Schreibt alle imperialen Distanzen in `text` deterministisch in metrische um. */
export function convertDistances(text: string): string {
  return text.replace(DISTANCE_RE, (full, num, unit) => toMetric(num, unit) ?? full);
}
