/**
 * Setzt Zauberverweise (`[Name](spell:<key>)`) in die DEUTSCHEN Regeltexte des Vaults.
 *
 * Die Gewissheit kommt aus dem englischen Zwillingsfeld: dort steht der SRD-Name, und nur
 * wo er in Zauber-Kontext steht (nach „spell"/„cast", kursiv, in einer Zauber-Tabelle),
 * gilt der deutsche Name im selben Absatz als Verweis. Reines Namens-Matching im Deutschen
 * träfe zu 86 % daneben — „hast du Vorteil", „Helles Licht", „|5|Blitz|" als Schadensart.
 *
 * Verlinkt wird nur das ERSTE Vorkommen je Absatz und Zauber; Wiederholungen bleiben Text.
 * Bereits verlinkte Stellen erkennt der Lauf, er ist also wiederholbar — nach jedem
 * Open5e-Import erneut fahren.
 *
 *   npx vite-node -c vitest.config.ts scripts/link-spell-refs.mts          # Bericht
 *   npx vite-node -c vitest.config.ts scripts/link-spell-refs.mts --apply  # schreiben
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['vault/items', 'vault/classes', 'vault/species', 'vault/feats', 'vault/backgrounds'];
const SPELLS = 'vault/spells';

interface SpellRef {
  key: string;
  de: string;
  en: string;
}

interface Wrap {
  file: string;
  field: string;
  spell: SpellRef;
  context: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.json')) out.push(full);
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function loadSpells(): { byEn: Map<string, SpellRef[]>; enNames: string[] } {
  const byEn = new Map<string, SpellRef[]>();
  for (const file of walk(SPELLS)) {
    const j = JSON.parse(readFileSync(file, 'utf8')) as { key?: string; name?: string; name_en?: string };
    if (!j.key || !j.name || !j.name_en) continue;
    const list = byEn.get(j.name_en) ?? [];
    list.push({ key: j.key, de: j.name, en: j.name_en });
    byEn.set(j.name_en, list);
  }
  // Längste zuerst: „Detect Magic" darf nicht als „Magic Missile"-Teiltreffer zerfallen.
  return { byEn, enNames: [...byEn.keys()].sort((a, b) => b.length - a.length) };
}

/** Spielbegriffe, die einen Zaubernamen enthalten — „cast Bright Light" ist eine Laterne. */
const FIXED_TERMS = [/\b(Bright|Dim)\s+$/];

/** Steht der Treffer im englischen Text als Zauber da — oder ist es ein Alltagswort? */
function spellContext(para: string, idx: number, len: number): boolean {
  if (FIXED_TERMS.some((re) => re.test(para.slice(Math.max(0, idx - 20), idx)))) return false;
  if (para.includes('|') && /\bspells?\b/i.test(para)) return true;
  const before = para.slice(Math.max(0, idx - 45), idx);
  const after = para.slice(idx + len, idx + len + 45);
  if (/\bspells?\b/i.test(before) || /^\W{0,3}spell\b/i.test(after)) return true;
  if (/\bcasts?\b|\bcasting\b/i.test(before)) return true;
  if (/\*$/.test(before) && /^\*/.test(after)) return true;
  if (/^[.,*]?\s*\(/.test(after) && /\bspells?\b/i.test(para.slice(0, idx))) return true;
  if (/-\s*$/.test(before) && /\bspells?\b/i.test(para.slice(0, idx))) return true;
  return false;
}

function referencedSpells(para: string, spells: ReturnType<typeof loadSpells>): SpellRef[] {
  const found: SpellRef[] = [];
  let masked = para;
  for (const en of spells.enNames) {
    const re = new RegExp('\\b' + esc(en) + '\\b');
    const m = masked.match(re);
    if (!m || m.index === undefined) continue;
    const idx = m.index;
    masked = masked.replace(new RegExp('\\b' + esc(en) + '\\b', 'g'), (x) => '#'.repeat(x.length));
    if (!spellContext(para, idx, en.length)) continue;
    const cands = spells.byEn.get(en) ?? [];
    // Mehrdeutig heißt: kein Link. Ein falscher Verweis ist schlimmer als keiner.
    if (cands.length === 1) found.push(cands[0]);
  }
  return found;
}

/** Erstes freies Vorkommen des deutschen Namens — nicht in einem Link, nicht im Wortinneren. */
function linkFirst(text: string, spell: SpellRef): string | null {
  const re = new RegExp('(^|[^\\p{L}\\]])(' + esc(spell.de) + ')($|[^\\p{L}])', 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = m.index + m[1].length;
    const rest = text.slice(at + spell.de.length);
    // In `[… ] (spell:…)` oder direkt vor `](` steckt der Name schon in einem Verweis.
    if (/^[^[\]]*\]\(spell:/.test(rest)) continue;
    return text.slice(0, at) + `[${text.substr(at, spell.de.length)}](spell:${spell.key})` + rest;
  }
  return null;
}

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

function main(apply: boolean) {
  const spells = loadSpells();
  const wraps: Wrap[] = [];
  let files = 0;

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const raw = readFileSync(file, 'utf8');
      const data = JSON.parse(raw) as unknown;
      let touched = false;

      for (const pair of fieldPairs(data)) {
        const next = [...pair.de];
        pair.en.forEach((enPara, i) => {
          if (next[i] === undefined) return;
          for (const spell of referencedSpells(enPara, spells)) {
            const linked = linkFirst(next[i], spell);
            if (!linked) continue;
            const at = linked.indexOf(`](spell:${spell.key})`);
            wraps.push({
              file, field: pair.path, spell,
              context: linked.slice(Math.max(0, at - 60), at + 20).replace(/\s+/g, ' '),
            });
            next[i] = linked;
            touched = true;
          }
        });
        if (touched) pair.set(next);
      }

      if (touched) {
        files++;
        if (apply) writeFileSync(file, JSON.stringify(data, null, 2) + (raw.endsWith('\n') ? '\n' : ''), 'utf8');
      }
    }
  }

  for (const w of wraps) console.log(`${w.file} ${w.field}\n    ${w.spell.en} → ${w.spell.de}\n    …${w.context}…`);
  console.log(`\n${apply ? 'Gesetzt' : 'Vorschlag'}: ${wraps.length} Verweise in ${files} Dateien`);
}

main(process.argv.includes('--apply'));
