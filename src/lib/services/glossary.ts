/**
 * EN→DE-Glossar für terminologie-treue Übersetzung (SRD 5.2.1).
 *
 * Idee: NICHT das ganze Glossar (232 Begriffe) in den Prompt dumpen, sondern pro
 * Aufruf nur die im englischen Quelltext vorkommenden Begriffe („Pinning"). So
 * skaliert die Prompt-Größe mit der Relevanz, nicht mit der Glossargröße.
 *
 * `glossary.json` ist die autoritative Quelle (aus dem SRD-Regelwerk abgeleitet).
 * Prompt-Anweisungen sind englisch (nur Zielbegriffe deutsch), Sektionen mit
 * XML-Tags gegliedert.
 */
import glossaryData from '$lib/data/glossary.json';
import { findImperial, type ImperialMatch } from '$lib/utils/distanceText';

interface RawTerm {
  en: string;
  de: string;
  cat?: string;
  abbrEn?: string;
  abbrDe?: string;
  ability?: string;
  from?: string;
}

export interface GlossaryTerm extends RawTerm {
  cat: string;
  /** Vorgerenderte Pin-Zeile („EN → DE" bzw. „ABBR → ABBR"), von selectTerms gesetzt. */
  pin?: string;
}

/** Flacht rules + derived + names (mit cat = Set-Name) zu einer Term-Liste ab. */
function flatten(): GlossaryTerm[] {
  const raw = glossaryData as unknown as {
    terms: RawTerm[];
    derived: RawTerm[];
    names: Record<string, unknown>;
  };
  const names: GlossaryTerm[] = Object.entries(raw.names)
    .filter(([k, v]) => k !== '_note' && Array.isArray(v))
    .flatMap(([set, arr]) => (arr as RawTerm[]).map((t) => ({ ...t, cat: set })));
  const all: GlossaryTerm[] = [
    ...raw.terms.map((t) => ({ ...t, cat: t.cat ?? 'rule' })),
    ...raw.derived.map((t) => ({ ...t, cat: t.cat ?? 'derived' })),
    ...names,
  ].filter((t) => t.en && t.de);
  // Mehrwortige zuerst → „Sleight of Hand" wird vor „Hand" geprüft/gelistet.
  all.sort((a, b) => b.en.split(' ').length - a.en.split(' ').length || b.en.length - a.en.length);
  return all;
}

/** Alle Glossarbegriffe, einmalig beim Modul-Laden aufbereitet. */
export const GLOSSARY: GlossaryTerm[] = flatten();

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Strukturierte Enum-Sets, die in Fließtext fast nur als Alltagswörter auftauchen
 * (school: „illusion"; size: „large radius"; creature_type: „giant/beast"). Sie
 * werden NICHT prosa-gescannt, sondern gezielt per pinForField aus einem Feld gepinnt.
 */
const SKIP_IN_SCAN = new Set(['school', 'size', 'creature_type']);

/**
 * Findet alle Glossarbegriffe, deren englische Form im Quelltext vorkommt.
 * Präzision: identische Paare (en===de) raus; Schadensarten nur bei „<type> damage";
 * strukturelle Enum-Sets nicht prosa-scannen; Abkürzungen case-sensitiv als ganzes Wort.
 */
export function selectTerms(sourceEn: string, glossary: GlossaryTerm[] = GLOSSARY): GlossaryTerm[] {
  const hay = ` ${sourceEn.toLowerCase().replace(/\s+/g, ' ')} `;
  const rawHay = ` ${sourceEn.replace(/\s+/g, ' ')} `; // case-sensitiv für Abkürzungen
  const hits: GlossaryTerm[] = [];
  for (const t of glossary) {
    if (t.en === t.de) continue;
    if (!SKIP_IN_SCAN.has(t.cat)) {
      const en = t.en.toLowerCase();
      const re =
        t.cat === 'damage_type'
          ? new RegExp(`\\b${esc(en)}\\s+damage\\b`) // „fire damage", nicht „fire"
          : new RegExp(`\\b${esc(en)}(s|es)?\\b`);
      if (re.test(hay)) {
        hits.push({ ...t, pin: `${t.en} → ${t.de}` });
        continue;
      }
    }
    if (t.abbrEn && new RegExp(`\\b${esc(t.abbrEn)}\\b`).test(rawHay)) {
      hits.push({ ...t, pin: `${t.abbrEn} → ${t.abbrDe}` });
    }
  }
  return hits;
}

/** Pinnt einen strukturierten Enum-Feldwert direkt (z.B. rarity/damage_type aus einem Feld). */
export function pinForField(value: string, set: string, glossary: GlossaryTerm[] = GLOSSARY): GlossaryTerm | null {
  const v = value.trim().toLowerCase();
  return glossary.find((t) => t.cat === set && t.en.toLowerCase() === v) ?? null;
}

/** Kompakter Terminologie-Block (XML-getaggt, englische Anweisung). Leer bei 0 Treffern. */
export function buildPinBlock(hits: GlossaryTerm[]): string {
  if (!hits.length) return '';
  const lines = hits.map((t) => `- ${t.pin ?? `${t.en} → ${t.de}`}`).join('\n');
  return `<glossary_de>\nUse exclusively the official German term for each of the following (inflect as needed):\n${lines}\n</glossary_de>`;
}

/**
 * Distanz-Pin-Block: deterministisch vorberechnete Umrechnungen aus dem EN-Quelltext
 * (dedupliziert). Das LLM platziert sie nur noch, rechnet nicht.
 */
export function buildDistancePins(sourceEn: string): string {
  const seen = new Map<string, ImperialMatch>();
  for (const m of findImperial(sourceEn)) seen.set(m.original.toLowerCase(), m);
  if (!seen.size) return '';
  const lines = [...seen.values()].map((d) => `- ${d.original} → ${d.metric}`).join('\n');
  return `<distance_conversions>\nUse these exact metric conversions; never output imperial units (feet/miles):\n${lines}\n</distance_conversions>`;
}

/**
 * Kombinierter Terminologie-Block für einen Quelltext: relevante Begriffe + Distanzen.
 * Für Fälle OHNE Quelltext (z.B. Generierung) siehe buildCorePinBlock().
 */
export function buildTerminologyBlock(sourceEn: string): string {
  return [buildPinBlock(selectTerms(sourceEn)), buildDistancePins(sourceEn)].filter(Boolean).join('\n\n');
}

/** Statischer Kern-Pin der geschlossenen Mengen (Schadensarten + Seltenheiten) — für Fälle ohne Quelltext. */
export function buildCorePinBlock(): string {
  const core = GLOSSARY.filter((t) => t.cat === 'damage_type' || t.cat === 'rarity').map((t) => ({
    ...t,
    pin: `${t.en} → ${t.de}`,
  }));
  return buildPinBlock(core);
}

// ── Lint ──────────────────────────────────────────────────────────────────────

/** Kuratierte, hochpräzise Falsch→Richtig-Liste der klassischen Drift-Fehler. Erweiterbar. */
export const WRONG_VARIANTS: { wrong: string; right: string }[] = [
  { wrong: 'Profizienzbonus', right: 'Übungsbonus' },
  { wrong: 'Kompetenzbonus', right: 'Übungsbonus' },
  { wrong: 'Fertigkeitsbonus', right: 'Übungsbonus' },
  { wrong: 'Profizienz', right: 'Übung' },
  { wrong: 'kurze Pause', right: 'Kurze Rast' },
  { wrong: 'lange Pause', right: 'Lange Rast' },
  { wrong: 'Strahlenschaden', right: 'Gleißender Schaden' },
  { wrong: 'Strahlender Schaden', right: 'Gleißender Schaden' },
  { wrong: 'Lichtschaden', right: 'Gleißender Schaden' },
  { wrong: 'Kraftschaden', right: 'Energieschaden' },
  { wrong: 'Wuchtmagie', right: 'Energieschaden' },
  { wrong: 'Donnerschaden', right: 'Schallschaden' },
  { wrong: 'Schlagschaden', right: 'Wuchtschaden' },
  { wrong: 'Abstimmung', right: 'Einstimmung' },
  { wrong: 'Sicherungswurf', right: 'Rettungswurf' },
];

const norm = (s: string): string => s.toLowerCase();

/** Distinktiver Stamm eines DE-Begriffs für tolerante Flexions-Suche. */
function stem(de: string): string {
  const word = de.split(' ').sort((a, b) => b.length - a.length)[0];
  return norm(word).slice(0, Math.max(5, word.length - 3));
}

export interface LintResult {
  ok: boolean;
  errors: { found: string; expected: string }[];
  imperial: { found: string; expected: string }[];
  warnings: { en: string; expected: string }[];
}

/**
 * Prüft die deutsche Ausgabe:
 *  - errors:   bekannte Falsch-Varianten (hochpräzise).
 *  - imperial: nicht-konvertierte Distanzen (feet/Fuß/mile/Meile) — Fehler.
 *  - warnings: gepinnter Begriff scheint nicht übernommen (Coverage, advisory).
 */
export function lint(outputDe: string, hits: GlossaryTerm[] = []): LintResult {
  const low = norm(outputDe);
  const errors: { found: string; expected: string }[] = [];
  for (const { wrong, right } of WRONG_VARIANTS) {
    if (new RegExp(`\\b${esc(norm(wrong))}\\b`).test(low)) errors.push({ found: wrong, expected: right });
  }
  const imperial = findImperial(outputDe).map((d) => ({ found: d.original, expected: d.metric }));
  const warnings: { en: string; expected: string }[] = [];
  for (const t of hits) {
    if (!low.includes(stem(t.de))) warnings.push({ en: t.en, expected: t.de });
  }
  return { ok: errors.length === 0 && imperial.length === 0, errors, imperial, warnings };
}
