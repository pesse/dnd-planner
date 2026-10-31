/**
 * Setzt Zauberverweise (`[Name](spell:<key>)`) in die DEUTSCHEN Regeltexte des Vaults.
 *
 * Die Gewissheit kommt aus dem englischen Zwillingsfeld: dort steht der SRD-Name, und nur
 * wo er in Zauber-Kontext steht (nach „spell"/„cast", kursiv, in einer Zauber-Tabelle),
 * gilt der deutsche Name im selben Absatz als Verweis. Reines Namens-Matching im Deutschen
 * träfe zu 86 % daneben — „hast du Vorteil", „Helles Licht", „|5|Blitz|" als Schadensart.
 *
 * Verlinkt wird jedes Vorkommen, denn der Link ist vor allem ein Tooltip. Bereits verlinkte
 * Stellen erkennt der Lauf, er ist also wiederholbar — nach neuen Texten erneut fahren.
 *
 *   npx vite-node -c vitest.config.ts scripts/link-spell-refs.mts          # Bericht
 *   npx vite-node -c vitest.config.ts scripts/link-spell-refs.mts --apply  # schreiben
 */
import { readFileSync } from 'node:fs';
import { esc, runLinker, walk, type Ref } from './vaultRefLinks';

const ROOTS = ['vault/items', 'vault/classes', 'vault/species', 'vault/feats', 'vault/backgrounds'];
const SPELLS = 'vault/spells';

function loadSpells(): { byEn: Map<string, Ref[]>; enNames: string[] } {
  const byEn = new Map<string, Ref[]>();
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
const FIXED_TERMS = /\b(Bright|Dim)\s+$/;
/** „weapons or a Shield" ist der Schild, auch neben „spells" — außer „spell" folgt („a Wish spell"). */
const ARTICLE = /\b(a|an)\s+$/;

/** Steht der Treffer im englischen Text als Zauber da — oder ist es ein Alltagswort? */
function spellContext(para: string, idx: number, len: number): boolean {
  const near = para.slice(Math.max(0, idx - 20), idx);
  const after = para.slice(idx + len, idx + len + 45);
  if (FIXED_TERMS.test(near)) return false;
  if (/^\W{0,3}spell\b/i.test(after)) return true;
  if (ARTICLE.test(near)) return false;
  if (para.includes('|') && /\bspells?\b/i.test(para)) return true;
  const before = para.slice(Math.max(0, idx - 45), idx);
  if (/\bspells?\b/i.test(before)) return true;
  if (/\bcasts?\b|\bcasting\b/i.test(before)) return true;
  if (/\*$/.test(before) && /^\*/.test(after)) return true;
  if (/^[.,*]?\s*\(/.test(after) && /\bspells?\b/i.test(para.slice(0, idx))) return true;
  if (/-\s*$/.test(before) && /\bspells?\b/i.test(para.slice(0, idx))) return true;
  return false;
}

function referencedSpells(para: string, spells: ReturnType<typeof loadSpells>): Ref[] {
  const found: Ref[] = [];
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

const spells = loadSpells();
runLinker({
  roots: ROOTS,
  scheme: 'spell:',
  refsIn: (para) => referencedSpells(para, spells),
  firstOnly: false,
  apply: process.argv.includes('--apply'),
});
