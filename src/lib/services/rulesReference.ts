/**
 * Regel-Nachschlagewerk: `lookupRule` ist der Term-Lookup über die Regelbibliothek
 * (`vault/rules`, alle Quellen), `searchRules` die unscharfe Volltextsuche über die deutsche
 * SRD-Prosa, gebündelt in `src/lib/data/` und offline erzeugt von `scripts/srd/`.
 */
import MiniSearch from 'minisearch';
import chunkData from '$lib/data/rules-chunks.json';
import { getRules, ruleDisplayName, type RuleInfo } from '$lib/rulesLibrary';

interface Chunk {
  id: string;
  section: string;
  heading: string;
  page: number;
  text: string;
}

const CHUNKS = chunkData as Chunk[];

/** Faltung für Lookup-Keys UND MiniSearch-Terme — beide müssen dieselbe Form sehen. */
const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const norm = (s: string): string => fold(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

const lookupMaps = new WeakMap<RuleInfo[], Map<string, RuleInfo>>();

/** Normalisiertes Deutsch, englischer Begriff als Alias — Deutsch gewinnt bei Kollision. */
function lookupMapOf(rules: RuleInfo[]): Map<string, RuleInfo> {
  const cached = lookupMaps.get(rules);
  if (cached) return cached;
  const map = new Map<string, RuleInfo>();
  for (const r of rules) if (r.nameDe) map.set(norm(r.nameDe), r);
  for (const r of rules) if (!map.has(norm(r.name))) map.set(norm(r.name), r);
  lookupMaps.set(rules, map);
  return map;
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
  entry?: RuleInfo;
  /** Bei Miss: die 3 ähnlichsten Begriffe. */
  suggestions?: string[];
}

/** Deutsch oder englisch, tolerant gegen Tippfehler. */
export async function lookupRule(term: string): Promise<RuleLookup> {
  const key = norm(term);
  if (!key) return { found: false, suggestions: [] };
  const rules = await getRules();
  const lookupMap = lookupMapOf(rules);

  const hit = lookupMap.get(key);
  if (hit) return { found: true, matchType: norm(ruleDisplayName(hit)) === key ? 'exact' : 'alias', entry: hit };

  // Fuzzy: nächster Key innerhalb einer längenabhängigen Schwelle.
  let best: RuleInfo | null = null;
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

  const suggestions = rules
    .map((r) => ({ name: ruleDisplayName(r), d: editDistance(key, norm(ruleDisplayName(r))) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.name);
  return { found: false, suggestions };
}

let index: MiniSearch<Chunk> | null = null;

/** Baut den Volltext-Index über die Regel-Chunks beim ersten Zugriff und cached ihn. */
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
