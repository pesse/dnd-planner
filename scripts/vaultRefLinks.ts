/**
 * Gemeinsamer Lauf der Verweis-Skripte (`link-spell-refs`, `link-rule-refs`): deutsche Felder
 * mit englischem Zwilling finden, im deutschen Text `[Name](<scheme><key>)` setzen.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Ref {
  key: string;
  de: string;
  en: string;
}

interface Wrap {
  file: string;
  field: string;
  ref: Ref;
  context: string;
}

export function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.json')) out.push(full);
  }
  return out;
}

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Nächstes freies Vorkommen des deutschen Namens — in keinem Verweis, nicht im Wortinneren. */
function linkNext(text: string, ref: Ref, scheme: string): string | null {
  const re = new RegExp('(^|[^\\p{L}\\]])(' + esc(ref.de) + ')($|[^\\p{L}])', 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = m.index + m[1].length;
    const rest = text.slice(at + ref.de.length);
    // Schon Teil eines Verweistexts, gleich welchen Schemas: `[Schutz vor Gift](spell:…)`.
    if (/^[^[\]]*\]\([a-z]+:/.test(rest)) continue;
    // Im Key selbst (`spell:srd-2024_geas`), wenn der Name dem Slug gleicht.
    if (/\([a-z]+:[^)\s]*$/.test(text.slice(0, at))) continue;
    return text.slice(0, at) + `[${text.substr(at, ref.de.length)}](${scheme}${ref.key})` + rest;
  }
  return null;
}

const isLinked = (text: string, ref: Ref, scheme: string): boolean =>
  text.includes(`](${scheme}${ref.key})`);

/** Deutsche Felder samt englischem Zwilling; der Zwilling entscheidet, was ein Verweis ist. */
function fieldPairs(node: unknown, trail = '', out: { path: string; en: string[]; de: string[]; set: (v: string[]) => void }[] = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => fieldPairs(v, `${trail}[${i}]`, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (/(_de|De)$/.test(k)) continue;
    const deKey = `${k}_de` in obj ? `${k}_de` : `${k}De` in obj ? `${k}De` : null;
    const flat = (x: unknown): string[] | null =>
      typeof x === 'string' ? [x] : Array.isArray(x) && x.every((s) => typeof s === 'string') ? (x as string[]) : null;
    const en = flat(v);
    const de = deKey ? flat(obj[deKey]) : null;
    if (en && de && deKey) {
      const wasString = typeof obj[deKey] === 'string';
      out.push({
        path: `${trail}.${deKey}`,
        en,
        de,
        set: (parts) => { obj[deKey] = wasString ? parts[0] : parts; },
      });
    } else if (v && typeof v === 'object') {
      fieldPairs(v, `${trail}.${k}`, out);
    }
  }
  return out;
}

export interface LinkerSpec {
  roots: string[];
  scheme: string;
  /** Welche Begriffe der englische Absatz meint — die Gewissheit für den deutschen. */
  refsIn(enPara: string, file: string): Ref[];
  /** `true` = nur das erste Vorkommen je Feld; sonst jedes. */
  firstOnly: boolean;
  /** Felder, die nichts verlinken, z.B. Namen; `path` wie `.traits[2].descDe`. */
  skipField?(path: string): boolean;
  apply: boolean;
}

export function runLinker(spec: LinkerSpec): void {
  const wraps: Wrap[] = [];
  let files = 0;

  for (const root of spec.roots) {
    for (const file of walk(root)) {
      const raw = readFileSync(file, 'utf8');
      const data = JSON.parse(raw) as unknown;
      let touched = false;

      for (const pair of fieldPairs(data)) {
        if (spec.skipField?.(pair.path)) continue;
        const next = [...pair.de];
        pair.en.forEach((enPara, i) => {
          if (next[i] === undefined) return;
          for (const ref of spec.refsIn(enPara, file)) {
            if (spec.firstOnly && isLinked(next[i], ref, spec.scheme)) continue;
            let linked: string | null;
            while ((linked = linkNext(next[i], ref, spec.scheme))) {
              let at = 0;
              while (linked[at] === next[i][at]) at++;
              wraps.push({
                file, field: pair.path, ref,
                context: linked.slice(Math.max(0, at - 60), at + 80).replace(/\s+/g, ' '),
              });
              next[i] = linked;
              touched = true;
              if (spec.firstOnly) break;
            }
          }
        });
        if (touched) pair.set(next);
      }

      if (touched) {
        files++;
        if (spec.apply) writeFileSync(file, JSON.stringify(data, null, 2) + (raw.endsWith('\n') ? '\n' : ''), 'utf8');
      }
    }
  }

  for (const w of wraps) console.log(`${w.file} ${w.field}\n    ${w.ref.en} → ${w.ref.de}\n    …${w.context}…`);
  console.log(`\n${spec.apply ? 'Gesetzt' : 'Vorschlag'}: ${wraps.length} Verweise in ${files} Dateien`);
}
