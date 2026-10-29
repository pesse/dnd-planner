/**
 * Statblöcke aus gespeicherten D&D-Beyond-Seiten des Monster Manual 2024 → Rohdatensätze in der
 * Form von Open5e v2 `/v2/creatures/`, damit `mapOpen5eCreature` der einzige Mapper bleibt.
 */

import { readCondition, readDamageType } from '$lib/schemas/vocabulary';

export interface StatBlock {
  raw: Record<string, unknown>;
  /** „Gear"-Zeile, die Open5e nicht kennt — der Importer macht daraus `armor_detail`. */
  gear: string[];
  /** Abwehr-Einträge außerhalb der Vokabulare, für `defenses_desc`. */
  defenseNotes: string[];
  warnings: string[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/g, (m, n) => ENTITIES[n] ?? m);
}

/** Open5e-Schreibweise: gerade Apostrophe, Bindestrich statt Halbgeviert („Recharge 5-6"). */
export const plain = (html: string): string =>
  decode(html.replace(/<[^>]+>/g, ''))
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** Die `<div class="stat-block">` samt verschachtelter Divs, in Dokumentreihenfolge. */
export function statBlockHtml(page: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = page.indexOf('<div class="stat-block"', from);
    if (start === -1) return out;
    const tag = /<\/?div\b[^>]*>/g;
    tag.lastIndex = start;
    let depth = 0;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(page))) {
      depth += m[0].startsWith('</') ? -1 : 1;
      if (depth === 0) break;
    }
    const end = m ? m.index + m[0].length : page.length;
    out.push(page.slice(start, end));
    from = end;
  }
}

const num = (s: string | undefined): number => Number((s ?? '').replace(/,/g, '')) || 0;

function challenge(cr: string): number {
  const frac = cr.match(/^(\d+)\/(\d+)$/);
  return frac ? Number(frac[1]) / Number(frac[2]) : num(cr);
}

const SPEED_KINDS = ['fly', 'swim', 'climb', 'burrow'] as const;

function speedOf(line: string): Record<string, unknown> {
  const speed: Record<string, unknown> = { walk: num(line.match(/^(\d+) ft/)?.[1]), hover: /\(hover\)/i.test(line) };
  for (const kind of SPEED_KINDS) speed[kind] = num(line.match(new RegExp(`${kind} (\\d+) ft`, 'i'))?.[1]);
  return speed;
}

const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'] as const;

/** „Poison, Psychic; Charmed, Exhaustion" — das Semikolon fehlt, wenn nur eine Seite besetzt ist. */
function defenses(line: string): { damage: string[]; conditions: string[]; other: string[] } {
  const out = { damage: [] as string[], conditions: [] as string[], other: [] as string[] };
  for (const name of line.split(/[,;](?![^(]*\))/).map((s) => s.trim()).filter(Boolean)) {
    // „Charmed (with Mind Blank)": der Zustand gehört in die Liste, die Einschränkung daneben.
    const bare = name.replace(/\s*\(.*\)$/, '');
    if (bare !== name) out.other.push(name);
    if (readDamageType(bare)) out.damage.push(bare);
    else if (readCondition(bare)) out.conditions.push(bare);
    else if (bare === name) out.other.push(name);
  }
  return out;
}

const ABILITY = { Str: 'strength', Dex: 'dexterity', Con: 'constitution', Int: 'intelligence', Wis: 'wisdom', Cha: 'charisma' } as const;

function abilities(html: string, warnings: string[]) {
  const scores: Record<string, number> = {};
  const saves: Record<string, number> = {};
  for (const row of html.matchAll(/<tr>\s*<th>(Str|Dex|Con|Int|Wis|Cha)<\/th>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g)) {
    const name = ABILITY[row[1] as keyof typeof ABILITY];
    scores[name] = num(row[2]);
    saves[name] = Number(plain(row[4]));
  }
  if (Object.keys(scores).length !== 6) warnings.push(`Attributstabelle unvollständig (${Object.keys(scores).length}/6)`);
  return { scores, saves };
}

/** „(2/Day)", „(Recharge 5-6)", „(Costs 2 Actions)" stehen im Namen und werden zu Feldern. */
function splitName(name: string): { name: string; usage?: { type: string; param: number }; cost?: number } {
  let rest = name;
  let usage: { type: string; param: number } | undefined;
  let cost: number | undefined;
  rest = rest.replace(/\s*\((\d+)\/Day(?: Each)?(?:; ([^)]*))?\)/i, (_, n, more) => {
    usage = { type: 'PER_DAY', param: Number(n) };
    return more ? ` (${more})` : '';
  });
  rest = rest.replace(/\s*\(Recharge (\d)(?:-\d)?\)/i, (_, n) => ((usage = { type: 'RECHARGE_ON_ROLL', param: Number(n) }), ''));
  rest = rest.replace(/\s*\(Recharge after a (?:Short or )?Long Rest\)/i, () => ((usage = { type: 'RECHARGE', param: 0 }), ''));
  rest = rest.replace(/\s*\(Costs (\d+) Actions\)/i, (_, n) => ((cost = Number(n)), ''));
  return { name: rest.trim(), usage, cost };
}

const DIE = /(\d+) \((\d+)d(\d+)(?: ?([+-]) ?(\d+))?\) (\w+) damage/;

function roll(m: RegExpMatchArray | null) {
  if (!m) return {};
  const bonus = m[4] ? Number(m[5]) * (m[4] === '-' ? -1 : 1) : 0;
  return { die_count: Number(m[2]), die_type: `D${m[3]}`, bonus, type: { key: m[6].toLowerCase() } };
}

/** Angriffswurf aus dem Fließtext; Open5e führt dieselben Zahlen als Felder. */
function attackOf(name: string, desc: string): Record<string, unknown>[] {
  const head = desc.match(/^(Melee|Ranged|Melee or Ranged) Attack Roll: ([+-]\d+)/);
  if (!head) return [];
  const reach = desc.match(/reach (\d+) ft/);
  const range = desc.match(/range (\d+)(?:\/(\d+))? ft/);
  const hit = desc.slice(desc.indexOf('Hit:'));
  const base = hit.match(DIE);
  const flat = base ? null : hit.match(/Hit: (\d+) (\w+) damage/);
  const extra = base ? hit.slice((base.index ?? 0) + base[0].length).match(new RegExp(`^ plus ${DIE.source}`)) : null;
  const damage = flat
    ? { die_count: 0, bonus: Number(flat[1]), type: { key: flat[2].toLowerCase() } }
    : roll(base);
  return [
    {
      name: `${name} attack`,
      attack_type: 'WEAPON',
      to_hit_mod: Number(head[2]),
      reach: reach ? Number(reach[1]) : null,
      range: range ? Number(range[1]) : null,
      long_range: range?.[2] ? Number(range[2]) : null,
      damage_die_count: damage.die_count,
      damage_die_type: 'die_type' in damage ? damage.die_type : null,
      damage_bonus: damage.bonus,
      damage_type: damage.type,
      ...(extra
        ? {
            extra_damage_die_count: Number(extra[2]),
            extra_damage_die_type: `D${extra[3]}`,
            extra_damage_bonus: extra[4] ? Number(extra[5]) * (extra[4] === '-' ? -1 : 1) : 0,
            extra_damage_type: { key: extra[6].toLowerCase() },
          }
        : {}),
    },
  ];
}

const SECTION_TYPE: Record<string, string> = {
  Actions: 'ACTION',
  'Bonus Actions': 'BONUS_ACTION',
  Reactions: 'REACTION',
  'Legendary Actions': 'LEGENDARY_ACTION',
};

interface Entry { name: string; desc: string; section: string }

/**
 * Ein Eintrag beginnt an `<strong><em>Name.</em></strong>`. Ein Absatz ohne Marke setzt den
 * vorigen fort; einer mit nur `<strong>` („At Will:", „Forbiddance.") und jedes `<li>` ist ein
 * Unterpunkt — im Vault als Liste `- **At Will:** …` wie bei den SRD-Monstern.
 */
function entries(paragraphs: { attrs: string; body: string; item: boolean }[], warnings: string[]): { entries: Entry[]; legendaryIntro: string } {
  const out: Entry[] = [];
  let section = 'Traits';
  let legendaryIntro = '';
  let listOpen = false;
  for (const { attrs, body, item } of paragraphs) {
    if (attrs.includes('monster-header')) {
      section = plain(body);
      continue;
    }
    if (attrs.includes('legendary-actions')) {
      legendaryIntro = plain(body);
      continue;
    }
    const titled = body.match(/^\s*<strong>\s*(<em>[\s\S]*?)<\/strong>\s*([\s\S]*)$/);
    const sub = titled ? null : body.match(/^\s*<strong>(.*?)<\/strong>\s*([\s\S]*)$/);
    const last = out[out.length - 1];
    if (titled) {
      let name = plain(titled[1]);
      let desc = plain(titled[2]).replace(/^\.\s*/, '');
      // „<strong><em>Petrifying Gaze (Recharge</em></strong> 5–6)." — die Klammer endet erst im Text.
      const open = desc.match(/^([^()]*\))\.?\s*/);
      if (name.split('(').length > name.split(')').length && open) {
        name = `${name} ${open[1]}`;
        desc = desc.slice(open[0].length);
      }
      out.push({ name: name.replace(/\.$/, ''), desc, section });
      listOpen = false;
    } else if (!last) {
      warnings.push(`Absatz ohne Eintrag: ${plain(body).slice(0, 60)}`);
    } else if (sub) {
      const label = plain(sub[1]).replace(/[.:]$/, '');
      last.desc += `${listOpen ? '\n' : '\n\n'}- **${label}:** ${plain(sub[2])}`;
      listOpen = true;
    } else if (item) {
      last.desc += `${listOpen ? '\n' : '\n\n'}- ${plain(body)}`;
      listOpen = true;
    } else {
      last.desc += `\n\n${plain(body)}`;
      listOpen = false;
    }
  }
  return { entries: out, legendaryIntro };
}

function header(lines: Map<string, string>, key: string): string {
  return lines.get(key) ?? '';
}

export function parseStatBlock(html: string): StatBlock {
  const warnings: string[] = [];
  const name = plain(html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/)?.[1] ?? '');
  const paragraphs = [...html.replace(/<div class="stats"[\s\S]*?<\/table><\/div>\s*<\/div>/, '').matchAll(/<(p|li)([^>]*)>([\s\S]*?)<\/\1>/g)]
    .map((m) => ({ attrs: m[2], body: m[3], item: m[1] === 'li' }));

  const typeLine = plain(paragraphs.shift()?.body ?? '');
  const lines = new Map<string, string>();
  while (paragraphs.length && !paragraphs[0].attrs.includes('monster-header')) {
    const p = paragraphs.shift()!;
    const label = p.body.match(/^\s*<strong>([^<]+)<\/strong>/);
    if (!label) {
      warnings.push(`Kopfzeile ohne Marke: ${plain(p.body).slice(0, 60)}`);
      continue;
    }
    for (const part of p.body.split(/(?=<strong>)/)) {
      const m = part.match(/^<strong>([^<]+)<\/strong>([\s\S]*)$/);
      if (m) lines.set(m[1].trim(), plain(m[2]));
    }
  }

  const type = typeLine.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or \w+)? (?:Swarm of \w+ )?(\w+?)s?(?: or \w+)?(?: \(([^)]*)\))?, (.+)$/);
  if (!type) warnings.push(`Typzeile unlesbar: ${typeLine}`);
  const hp = header(lines, 'HP').match(/^(\d+) \(([^)]+)\)/);
  const cr = header(lines, 'CR').match(/^([\d/]+) \(XP ([\d,]+)/);
  const { scores, saves } = abilities(html, warnings);
  const senses = header(lines, 'Senses');
  const languages = header(lines, 'Languages');
  const immunities = defenses(header(lines, 'Immunities'));
  const resistances = defenses(header(lines, 'Resistances'));
  const vulnerabilities = defenses(header(lines, 'Vulnerabilities'));
  const { entries: list, legendaryIntro } = entries(paragraphs, warnings);
  const skills = Object.fromEntries(
    header(lines, 'Skills')
      .split(',')
      .map((s) => s.trim().match(/^(.+?) ([+-]\d+)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], Number(m[2])]),
  );

  const traits = list.filter((e) => e.section === 'Traits').map((e) => ({ name: e.name, desc: e.desc }));
  const legendary = legendaryIntro.match(/^(Legendary Action Uses: [^.]+)\. (.*)$/);
  if (legendaryIntro && !legendary) warnings.push(`Legendär-Einleitung unlesbar: ${legendaryIntro}`);
  if (legendary) traits.push({ name: legendary[1], desc: legendary[2] });

  const order = new Map<string, number>();
  const actions = list
    .filter((e) => e.section !== 'Traits')
    .map((e) => {
      const actionType = SECTION_TYPE[e.section];
      if (!actionType) warnings.push(`Unbekannter Abschnitt „${e.section}"`);
      const split = splitName(e.name);
      const idx = (order.get(e.section) ?? 0) + 1;
      order.set(e.section, idx);
      return {
        name: split.name,
        desc: e.desc,
        action_type: actionType ?? 'ACTION',
        order_in_statblock: idx,
        legendary_action_cost: actionType === 'LEGENDARY_ACTION' ? (split.cost ?? 1) : 0,
        usage_limits: split.usage ?? null,
        attacks: attackOf(split.name, e.desc),
      };
    });

  const named = (names: string[]) => names.map((n) => ({ name: n }));
  const [langHead] = languages.split(';');
  const raw: Record<string, unknown> = {
    name,
    size: { key: (type?.[1] ?? 'medium').toLowerCase() },
    type: { key: (type?.[2] ?? '').toLowerCase().replace(/^monstrositie$/, 'monstrosity') },
    alignment: (type?.[4] ?? '').toLowerCase(),
    challenge_rating: challenge(cr?.[1] ?? '0'),
    experience_points: num(cr?.[2]),
    armor_class: num(header(lines, 'AC').match(/^(\d+)/)?.[1]),
    armor_detail: '',
    hit_points: num(hp?.[1]),
    hit_dice: hp?.[2] ?? '',
    ability_scores: scores,
    saving_throws: saves,
    skill_bonuses: skills,
    speed: speedOf(header(lines, 'Speed')),
    ...Object.fromEntries(SENSES.map((s) => [`${s}_range`, num(senses.match(new RegExp(`${s} (\\d+) ft`, 'i'))?.[1])])),
    languages: /^none$/i.test(languages)
      ? { as_string: '' }
      : { as_string: languages, data: /\b(and|plus|understands|any|but)\b/i.test(langHead) ? [] : named(langHead.split(/,(?![^(]*\))/).map((s) => s.trim())) },
    resistances_and_immunities: {
      damage_resistances: named(resistances.damage),
      damage_immunities: named(immunities.damage),
      damage_vulnerabilities: named(vulnerabilities.damage),
      condition_immunities: named(immunities.conditions),
    },
    traits,
    actions,
  };
  if (!cr) warnings.push(`CR unlesbar: ${header(lines, 'CR')}`);
  if (!hp) warnings.push(`HP unlesbar: ${header(lines, 'HP')}`);
  const gear = header(lines, 'Gear').split(',').map((s) => s.trim()).filter(Boolean);
  const defenseNotes = [...resistances.other, ...immunities.other, ...vulnerabilities.other];
  return { raw, gear, defenseNotes, warnings };
}
