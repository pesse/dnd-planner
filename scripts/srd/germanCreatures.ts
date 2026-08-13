/**
 * Legt den deutschen SRD-Text aus `monsters-de.json` auf eine gemappte Open5e-Kreatur.
 *
 * Zugeordnet wird über die sprachunabhängigen Zahlen — Namen taugen nicht, denn genau die sind
 * das Gesuchte. Erst (RK, TP, HG, sechs Attributswerte), dann für den Rest nur (RK, TP, HG):
 * die zweite Runde löst auf, wo der Extrakt einen Attributswert nicht lesen konnte, weil die
 * erste Runde die Konkurrenten schon verbraucht hat.
 *
 * Innerhalb einer Gruppe (Merkmale, Aktionen, …) trägt die Position NICHT: beide Seiten sortieren
 * hinter „Mehrfachangriff" alphabetisch, jede in ihrer eigenen Sprache, und beim Oger stehen
 * darum Zweihandknüppel/Greatclub und Wurfspeer/Javelin vertauscht. Zugeordnet wird deshalb über
 * die Zahlen im Text — Würfel, Durchschnitt, SG und Trefferbonus stehen in beiden Fassungen
 * gleich. Was danach übrig bleibt (Mehrfachangriff, Gestaltwandeln: Texte ohne Zahlen), geht der
 * Reihe nach zusammen, und `applyGermanText` prüft jeden Angriff noch einmal gegen seine Zahlen.
 */
import { readFileSync } from 'node:fs';
import { MONSTER_ACTION_TYPES, type Monster, type MonsterAction, type MonsterTrait } from '$lib/schemas/monster';
import { ABILITY_KEYS } from '$lib/schemas/abilities';

export interface GermanEntry {
  name: string;
  desc: string;
}

export interface GermanCreature {
  name: string;
  type_line: string;
  ac: number;
  hp: number;
  cr: number;
  abilities: number[];
  /** Nur der PDF-Extrakt kennt eine Seite; eine aus der Bibliothek gebaute Quelle hat keine. */
  page?: number;
  groups: Partial<Record<'traits' | (typeof MONSTER_ACTION_TYPES)[number], GermanEntry[]>>;
}

export const GERMAN_CREATURES = 'scripts/srd/monsters-de.json';

export function loadGermanCreatures(path = GERMAN_CREATURES): GermanCreature[] {
  return JSON.parse(readFileSync(path, 'utf8')) as GermanCreature[];
}

const headKey = (ac: number, hp: number, cr: number): string => `${ac}/${hp}/${cr}`;
const fullKey = (ac: number, hp: number, cr: number, abilities: number[]): string =>
  `${headKey(ac, hp, cr)}/${abilities.join('-')}`;

// Reihenfolge wie im gedruckten Statblock, also wie im Extrakt: STÄ, GES, KON, INT, WEI, CHA.
const monsterKeys = (m: Monster): [string, string] => [
  fullKey(m.armor_class, m.hit_points, m.challenge_rating, ABILITY_KEYS.map((k) => m.ability_scores[k])),
  headKey(m.armor_class, m.hit_points, m.challenge_rating),
];

const germanKeys = (r: GermanCreature): [string, string] => [
  fullKey(r.ac, r.hp, r.cr, r.abilities),
  headKey(r.ac, r.hp, r.cr),
];

/** Nur eindeutige Paare gelten — ein Schlüssel mit mehreren Kandidaten bleibt offen. */
function pairRound<T>(
  monsters: Monster[],
  records: GermanCreature[],
  keyOf: (m: Monster) => string,
  recordKeyOf: (r: GermanCreature) => string,
  out: Map<Monster, GermanCreature>,
  taken: Set<GermanCreature>,
): void {
  const byMonster = new Map<string, Monster[]>();
  const byRecord = new Map<string, GermanCreature[]>();
  for (const m of monsters) {
    if (out.has(m)) continue;
    const list = byMonster.get(keyOf(m)) ?? [];
    list.push(m);
    byMonster.set(keyOf(m), list);
  }
  for (const r of records) {
    if (taken.has(r)) continue;
    const list = byRecord.get(recordKeyOf(r)) ?? [];
    list.push(r);
    byRecord.set(recordKeyOf(r), list);
  }
  for (const [key, ms] of byMonster) {
    const rs = byRecord.get(key) ?? [];
    if (ms.length !== 1 || rs.length !== 1) continue;
    out.set(ms[0], rs[0]);
    taken.add(rs[0]);
  }
}

/**
 * `fallback: false` lässt die zweite Runde weg. Nötig, sobald auch Homebrew in der Liste steht:
 * ohne die Attributswerte trifft (RK, TP, HG) allein zu leicht auf eine fremde SRD-Kreatur.
 */
export function matchGermanCreatures(
  monsters: Monster[],
  records: GermanCreature[],
  { fallback = true }: { fallback?: boolean } = {},
): Map<Monster, GermanCreature> {
  const out = new Map<Monster, GermanCreature>();
  const taken = new Set<GermanCreature>();
  pairRound(monsters, records, (m) => monsterKeys(m)[0], (r) => germanKeys(r)[0], out, taken);
  if (fallback) pairRound(monsters, records, (m) => monsterKeys(m)[1], (r) => germanKeys(r)[1], out, taken);
  return out;
}

// Die Statblock-Formeln trennen die Sprachen zuverlässiger als einzelne Vokabeln.
const EN_MARKERS = /Attack Roll|Hit:|Saving Throw|\bdamage\b/gi;
const DE_MARKERS = /Angriffswurf|Treffer:|Rettungswurf|schaden\b/gi;

const countMatches = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

/**
 * Altdateien tragen ihren Text in `name`/`desc`, egal in welcher Sprache — `*_en` gab es noch
 * nicht. War die Datei eine englische Kopie, muss das Original dorthin, bevor Deutsch `desc`
 * besetzt. Rückgabe: ob sie englisch verfasst war.
 */
export function captureEnglishOriginal(monster: Monster): boolean {
  const entries: Entry[] = [...monster.traits, ...monster.actions];
  const text = entries.map((e) => `${e.name} ${e.desc}`).join(' ');
  if (countMatches(text, EN_MARKERS) <= countMatches(text, DE_MARKERS)) return false;
  monster.name_en ||= monster.name;
  for (const entry of entries) {
    entry.name_en ||= entry.name;
    entry.desc_en ||= entry.desc;
  }
  return true;
}

/**
 * Ein fertig eingedeutschtes Bibliotheksmonster als deutsche Quelle. Akt-lokale Dateien sind oft
 * englische Kopien eines Bibliotheksmonsters mit verschobenen Zahlen — dort greift der
 * Zahlen-Match nicht mehr, der englische Name aber schon.
 */
export function germanFromMonster(monster: Monster): GermanCreature {
  const asEntry = (e: Entry): GermanEntry => ({ name: e.name, desc: e.desc });
  return {
    name: monster.name,
    type_line: '',
    ac: monster.armor_class,
    hp: monster.hit_points,
    cr: monster.challenge_rating,
    abilities: ABILITY_KEYS.map((k) => monster.ability_scores[k]),
    groups: {
      traits: monster.traits.map(asEntry),
      ...Object.fromEntries(
        MONSTER_ACTION_TYPES.map((type) => [type, monster.actions.filter((a) => a.action_type === type).map(asEntry)]),
      ),
    },
  };
}

/**
 * Der Statblock hängt „(Aufladung 5–6)" selbst an die Aktionszeile (`actionTitle`), das deutsche
 * SRD schreibt es in den Namen. Ohne diesen Schnitt steht es zweimal da. Am Merkmal bleibt die
 * Klammer, dort rendert nichts sie nach.
 */
const USAGE_CLAUSE = /^\s*(?:Aufladung\b|\d+-mal\s+täglich\b)/;

function stripUsageClause(name: string): string {
  const open = name.lastIndexOf('(');
  if (open === -1 || !name.trimEnd().endsWith(')')) return name;
  const inner = name.slice(open + 1, name.lastIndexOf(')'));
  const rest = inner
    .split(';')
    .filter((part) => !USAGE_CLAUSE.test(part))
    .join(';')
    .trim();
  return rest ? `${name.slice(0, open)}(${rest})`.trim() : name.slice(0, open).trim();
}

/**
 * Die Zahlen eines Textes als Vergleichsschlüssel: Würfel („2d6" wie „2W6"), dann alles übrige
 * Ziffernwerk (Durchschnittsschaden, SG, Trefferbonus). Der deutsche Satz „11 (2W6+4)" und der
 * englische „11 (2d6 + 4)" ergeben dieselbe Liste.
 */
function numberTokens(text: string): string[] {
  const dice = /(\d+)\s*[dwDW]\s*(\d+)/g;
  const out = [...text.matchAll(dice)].map((m) => `${+m[1]}W${+m[2]}`);
  out.push(...[...text.replace(dice, ' ').matchAll(/\d+/g)].map((m) => String(+m[0])));
  return out;
}

/** Anzahl gemeinsamer Token (mit Vielfachheit). */
function overlap(a: string[], b: string[]): number {
  const pool = [...b];
  let hits = 0;
  for (const token of a) {
    const at = pool.indexOf(token);
    if (at !== -1) {
      pool.splice(at, 1);
      hits++;
    }
  }
  return hits;
}

/** Mindestens zwei gemeinsame Zahlen — eine allein (oft nur der SG) trifft zu leicht daneben. */
const MIN_OVERLAP = 2;

/** `scored`: über gemeinsame Zahlen bestätigt. Sonst blieb nur die Reihenfolge — ein Verdacht. */
interface Alignment {
  de: GermanEntry;
  scored: boolean;
}

/**
 * Ordnet die deutschen Einträge einer Gruppe den englischen zu: erst die eindeutigen
 * Zahlen-Treffer (stärkster zuerst), dann der Rest in seiner Reihenfolge.
 */
function alignEntries(entries: Entry[], german: GermanEntry[]): (Alignment | undefined)[] {
  const enTokens = entries.map((e) => numberTokens(e.desc_en || e.desc));
  const deTokens = german.map((e) => numberTokens(e.desc));

  const candidates = enTokens
    .flatMap((tokens, i) => deTokens.map((other, j) => ({ i, j, score: overlap(tokens, other) })))
    .filter((c) => c.score >= MIN_OVERLAP)
    .sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);

  const out: (Alignment | undefined)[] = entries.map(() => undefined);
  const used = new Set<number>();
  for (const { i, j } of candidates) {
    if (out[i] || used.has(j)) continue;
    out[i] = { de: german[j], scored: true };
    used.add(j);
  }

  const leftovers = german.filter((_, j) => !used.has(j));
  for (const [i, slot] of out.entries()) {
    const next = slot ? undefined : leftovers.shift();
    if (next) out[i] = { de: next, scored: false };
  }
  return out;
}

/** Erwähnt der deutsche Text die Zahlen des Angriffs? Sonst zeigen die Listen aneinander vorbei. */
function attackMismatch(action: MonsterAction, desc: string): string[] {
  const attack = action.attacks[0];
  if (!attack) return [];
  const wanted = [attack.to_hit_mod < 0 ? `−${Math.abs(attack.to_hit_mod)}` : `+${attack.to_hit_mod}`];
  const damage = attack.damage;
  if (damage?.die_count && damage.die_type) wanted.push(`${damage.die_count}W${damage.die_type.slice(1)}`);
  return wanted.filter((token) => !desc.includes(token));
}

type Entry = MonsterTrait | MonsterAction;

const isAction = (entry: Entry): entry is MonsterAction => 'action_type' in entry;

/**
 * Setzt `name`/`desc` auf Deutsch und lässt `name_en`/`desc_en` als Original stehen. Rückgabe
 * sind die Auffälligkeiten: nicht übertragene Einträge und fehlgeschlagene Zahlenproben.
 */
export function applyGermanText(
  monster: Monster,
  record: GermanCreature,
  { extras = true }: { extras?: boolean } = {},
): string[] {
  const notes: string[] = [];
  if (record.name !== monster.name) monster.name = record.name;

  const groups: [string, Entry[]][] = [
    ['traits', monster.traits],
    ...MONSTER_ACTION_TYPES.map((type): [string, Entry[]] => [type, monster.actions.filter((a) => a.action_type === type)]),
  ];

  for (const [group, entries] of groups) {
    const german = record.groups[group as keyof GermanCreature['groups']] ?? [];
    if (!german.length && !entries.length) continue;

    const aligned = alignEntries(entries, german);
    for (const [index, entry] of entries.entries()) {
      // Leeres `desc_en` heißt: kein englisches Original — der Eintrag ist schon deutsch verfasst
      // (handgepflegtes Homebrew auf einem SRD-Statblock) und braucht keine Übersetzung.
      if (!entry.desc_en) continue;
      const match = aligned[index];
      if (!match) {
        notes.push(`„${entry.name}" (${group}) ohne deutsche Entsprechung`);
        continue;
      }
      const { de, scored } = match;
      const missing = isAction(entry) ? attackMismatch(entry, de.desc) : [];
      if (missing.length) {
        const found = numberTokens(de.desc).filter((t) => t.includes('W'));
        const problem = `„${entry.name}" (${group}) ↮ „${de.name}": ${missing.join(', ')} fehlt, deutscher Text nennt ${found.join(', ') || 'keine Würfel'}`;
        // Ohne Zahlen-Bestätigung ist das Paar geraten — dann lieber englisch lassen. Bestätigt
        // heißt es: Open5e und SRD widersprechen sich in den Zahlen (Datenfehler bei Open5e).
        if (!scored) {
          notes.push(`${problem} — nicht übernommen`);
          continue;
        }
        notes.push(`${problem} — Zahlen aus Open5e prüfen`);
      }
      entry.name = isAction(entry) && entry.usage_limits ? stripUsageClause(de.name) : de.name;
      entry.desc = de.desc;
    }

    // Das deutsche SRD führt Einträge, die Open5e nicht hat (die Vetteln haben „Zirkelmagie").
    // Sie kommen ohne englische Fassung dazu, statt verloren zu gehen. `extras: false` schaltet das
    // ab, wo der Statblock nicht der des SRD ist: an einem Reskin wäre das neue Mechanik.
    if (!extras) continue;
    const matched = new Set(aligned.map((a) => a?.de));
    for (const extra of german.filter((e) => !matched.has(e))) {
      const added: Entry =
        group === 'traits'
          ? { name: extra.name, name_en: '', desc: extra.desc, desc_en: '' }
          : {
              name: extra.name,
              name_en: '',
              desc: extra.desc,
              desc_en: '',
              action_type: group as MonsterAction['action_type'],
              legendary_action_cost: 1,
              attacks: [],
            };
      if (isAction(added)) monster.actions.push(added);
      else monster.traits.push(added);
      notes.push(`${group}: „${extra.name}" nur im deutschen SRD — ohne englische Fassung ergänzt`);
    }
  }

  return notes;
}
