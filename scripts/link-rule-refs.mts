/**
 * Setzt Regelverweise (`[Name](rule:<key>)`) in die DEUTSCHEN Regeltexte des Vaults.
 *
 * Wie bei `link-spell-refs.mts` entscheidet das englische Zwillingsfeld: Das SRD schreibt
 * Glossarbegriffe groß („gain Heroic Inspiration", „has the Prone condition"), nur dann gilt der
 * deutsche Name im selben Absatz als Verweis. Verlinkt wird nur das erste Vorkommen je Absatz.
 *
 *   npx vite-node -c vitest.config.ts scripts/link-rule-refs.mts          # Bericht
 *   npx vite-node -c vitest.config.ts scripts/link-rule-refs.mts --apply  # schreiben
 */
import { readFileSync } from 'node:fs';
import { esc, runLinker, walk, type Ref } from './vaultRefLinks';

const RULES = 'vault/rules';
const ROOTS = ['vault/items', 'vault/classes', 'vault/species', 'vault/feats', 'vault/backgrounds', RULES];

/**
 * Grundbegriffe, die fast jeder Absatz nennt — als Link wären sie Rauschen. Manche sind auch
 * Satzanfänge („Damage is …") oder deutsche Alltagswörter („Ziel", „Gegenstand", „Größe").
 */
const TOO_COMMON = new Set([
  'Ability Check', 'Ability Score and Modifier', 'Action', 'Advantage', 'Adventure', 'Ally',
  'Armor Class', 'Attack', 'Attack Roll', 'Attitude', 'Bonus Action', 'Campaign', 'Character Sheet',
  'Condition', 'Creature', 'Creature Type', 'D20 Test', 'Damage', 'Damage Roll', 'Difficulty Class',
  'Disadvantage', 'Encounter', 'Enemy', 'Hazard', 'Healing', 'Hit Points', 'Magic', 'Monster',
  'Nonplayer Character', 'Object', 'Per Day', 'Player Character', 'Proficiency', 'Reaction',
  'Round Down', 'Save', 'Saving Throw', 'Size', 'Skill', 'Speed', 'Spell', 'Stat Block', 'Target',
  'Weapon', 'Weapon Attack', 'Spell Attack', 'Damage Types',
]);

/** Deutsche Beugungen: „Schwieriges Gelände" → „Schwierigem Gelände", „Kurze Rast" → „Kurzen Rast". */
function germanForms(de: string): string[] {
  const words = de.split(' ');
  const forms = new Set([de]);
  if (words.length > 1 && /(e|es|er)$/.test(words[0])) {
    const stem = words[0].replace(/(e|es|er)$/, '');
    for (const end of ['e', 'en', 'em', 'er', 'es']) forms.add([stem + end, ...words.slice(1)].join(' '));
  }
  // Plural- und Singularform eines Substantivs: „Gelegenheitsangriffe" ↔ „Gelegenheitsangriff".
  if (words.length === 1 && /e$/.test(de)) forms.add(de.slice(0, -1));
  if (words.length === 1 && /e$/.test(de)) forms.add(de + 'n');
  return [...forms].sort((a, b) => b.length - a.length);
}

interface RuleTerm {
  key: string;
  /** Wirkungsbereich — in Gegenständen meist die Form des Dings selbst („Würfel“, „Kugel“). */
  area: boolean;
  en: RegExp;
  refs: Ref[];
}

function loadRules(): { terms: RuleTerm[]; keyOfFile: Map<string, string> } {
  const terms: (RuleTerm & { len: number })[] = [];
  const keyOfFile = new Map<string, string>();
  for (const file of walk(RULES)) {
    const r = JSON.parse(readFileSync(file, 'utf8')) as { key: string; name: string; nameDe?: string; category: string };
    keyOfFile.set(file, r.key);
    if (!r.nameDe || TOO_COMMON.has(r.name)) continue;
    // Das Glossar steht teils im Plural („Opportunity Attacks"), der Text meist im Singular.
    const en = esc(r.name.replace(/s$/, '')) + 's?';
    terms.push({
      key: r.key,
      area: r.category === 'area_of_effect',
      en: new RegExp('\\b' + en + '\\b', 'g'),
      refs: germanForms(r.nameDe).map((de) => ({ key: r.key, de, en: r.name })),
      len: r.name.length,
    });
  }
  // Längste zuerst: „Death Saving Throw" darf nicht als „Saving Throw" zerfallen.
  return { terms: terms.sort((a, b) => b.len - a.len), keyOfFile };
}

function referencedRules(para: string, file: string, rules: ReturnType<typeof loadRules>): Ref[] {
  const self = rules.keyOfFile.get(file);
  const found: Ref[] = [];
  let masked = para;
  for (const t of rules.terms) {
    const before = masked;
    let named = true;
    masked = masked.replace(t.en, (x, at: number) => {
      if (!insideName(para, at, x.length)) named = false;
      return '#'.repeat(x.length);
    });
    if (masked === before || named) continue;
    if (t.key !== self && !(t.area && file.startsWith('vault/items/'))) found.push(...t.refs);
  }
  return found;
}

/** „Cube of Summoning", „Legendary Resistance": ein eigener Name, der den Begriff nur enthält. */
function insideName(para: string, at: number, len: number): boolean {
  return /^ of [A-Z]/.test(para.slice(at + len)) || /\bLegendary $/.test(para.slice(0, at));
}

const rules = loadRules();
runLinker({
  roots: ROOTS,
  scheme: 'rule:',
  refsIn: (para, file) => referencedRules(para, file, rules),
  skipField: (path) => /\.(name|title)(De|_de)$/.test(path),
  firstOnly: true,
  apply: process.argv.includes('--apply'),
});
