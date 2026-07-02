/**
 * Regel-Nachschlagewerk (SRD 5.2.1 DE) — Laufzeit.
 *
 * Stufe 1: strukturierter Term-Lookup über das Regelglossar (exakt / EN-DE-Alias /
 *          Fuzzy-Fallback) — deterministisch, autoritativ.
 * Stufe 2: lexikalische Volltextsuche (MiniSearch) über die Regel-Prosa-Chunks —
 *          lazy aufgebauter In-Memory-Index (Muster wie spellLibrary.ts).
 *
 * Daten kommen gebündelt aus src/lib/data/ (offline generiert, siehe scripts/srd/).
 */
import MiniSearch from 'minisearch';
import glossaryData from '$lib/data/rules-glossary.json';
import chunkData from '$lib/data/rules-chunks.json';

export interface RuleEntry {
  de: string;
  en: string;
  cat: string;
  page: number;
  definition: string;
  seeAlso: string[];
}
interface Chunk {
  id: string;
  section: string;
  heading: string;
  page: number;
  text: string;
}

const ENTRIES = glossaryData as RuleEntry[];
const CHUNKS = chunkData as Chunk[];

/** Alle deutschen Regelbegriffe — z.B. um den Term-Index in einen Prompt zu pinnen. */
export const RULES_TERMS: string[] = ENTRIES.map((e) => e.de);

// ── Normalisierung (identisch für Lookup-Keys und MiniSearch-Terme) ────────────
const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const norm = (s: string): string => fold(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// ── Stufe 1: Lookup-Map (normalisiertes de + en als Alias) ─────────────────────
const lookupMap = new Map<string, RuleEntry>();
for (const e of ENTRIES) {
  lookupMap.set(norm(e.de), e);
  if (!lookupMap.has(norm(e.en))) lookupMap.set(norm(e.en), e);
}

/** Levenshtein-Distanz (klein gehalten; nur für den Fuzzy-Fallback). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export interface RuleLookup {
  found: boolean;
  matchType?: 'exact' | 'alias' | 'fuzzy';
  entry?: RuleEntry;
  /** Bei Miss: die 3 ähnlichsten deutschen Begriffe. */
  suggestions?: string[];
}

/** Schlägt einen Regelbegriff nach — deutsch oder englisch, tolerant gegen Tippfehler. */
export function lookupRule(term: string): RuleLookup {
  const key = norm(term);
  if (!key) return { found: false, suggestions: [] };

  const hit = lookupMap.get(key);
  if (hit) return { found: true, matchType: norm(hit.de) === key ? 'exact' : 'alias', entry: hit };

  // Fuzzy: nächster Key innerhalb einer längenabhängigen Schwelle.
  let best: RuleEntry | null = null;
  let bestD = Infinity;
  for (const [k, e] of lookupMap) {
    const d = editDistance(key, k);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  const threshold = Math.max(2, Math.floor(key.length * 0.34));
  if (best && bestD <= threshold) return { found: true, matchType: 'fuzzy', entry: best };

  const suggestions = ENTRIES.map((e) => ({ de: e.de, d: editDistance(key, norm(e.de)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.de);
  return { found: false, suggestions };
}

// ── Stufe 2: MiniSearch-Index (lazy singleton) ─────────────────────────────────
let index: MiniSearch<Chunk> | null = null;

/** Baut (einmalig) den Volltext-Index über die Regel-Chunks und cached ihn. */
export function getRulesIndex(): MiniSearch<Chunk> {
  if (index) return index;
  const ms = new MiniSearch<Chunk>({
    fields: ['heading', 'section', 'text'],
    storeFields: ['section', 'heading', 'page', 'text'],
    // Deutscher Tokenizer-Ersatz: Umlaut/ß-Faltung; kein Stemmer (Prefix+Fuzzy als Ausgleich).
    processTerm: (t) => (t.length > 1 ? fold(t) : null),
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { heading: 2, section: 1.5 } },
  });
  ms.addAll(CHUNKS);
  index = ms;
  return ms;
}

export interface RuleSearchResult {
  section: string;
  heading: string;
  page: number;
  text: string;
}

/** Volltextsuche über die Regel-Prosa; liefert die Top-k Passagen mit Sektion + Seite. */
export function searchRules(query: string, k = 5): RuleSearchResult[] {
  if (!query.trim()) return [];
  return getRulesIndex()
    .search(query)
    .slice(0, k)
    .map((r) => ({
      section: r.section as string,
      heading: r.heading as string,
      page: r.page as number,
      text: r.text as string,
    }));
}
