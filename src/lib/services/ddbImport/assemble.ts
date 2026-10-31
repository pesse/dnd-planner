/**
 * `DdbSheet` → `Character`: die Werte, die ohne Bibliothek feststehen. Verknüpft wird in
 * `linkEntities.ts`; was dort offen bleibt, meldet der `FindingLog` an den Wizard.
 */
import { characterSchema, type Character } from '$lib/schemas/characterSchema';
import type { DdbSheet } from '$lib/schemas/ddbSheet';
import { MONSTER_SIZES, type MonsterSize } from '$lib/schemas/vocabulary';
import { SKILL_DEFS, mod } from '$lib/domain/skills';
import { displayName, matchWeaponName, type ItemIndex } from '$lib/itemLibrary';
import { normName } from '$lib/utils/text';
import { libraryWeightKg } from '$lib/utils/inventoryWeight';
import { FindingLog, findingId, type Resolutions } from './findings';
import { linkEntities, type DdbImportLibraries, type ImportNote } from './linkEntities';

export type { DdbImportLibraries, ImportNote } from './linkEntities';

export interface DdbImportResult {
  character: Character;
  /** Inhalt für `details.md`: Hintergrundgeschichte, Verbündete, Notizen, nicht verknüpfte Zauber. */
  details: string;
  notes: ImportNote[];
  findings: FindingLog['findings'];
}

const FT_TO_M = 0.3;
const metres = (ft: number): string => String(Math.round(ft * FT_TO_M * 10) / 10).replace('.', ',');

function presentationOf(gender: string): Character['presentation'] {
  const g = gender.trim().toLowerCase();
  if (/^(m|male|männlich|mann)$/.test(g)) return 'masculine';
  if (/^(f|w|female|weiblich|frau)$/.test(g)) return 'feminine';
  return undefined;
}

/** Deutscher Name aus der Item-Bibliothek, sonst der Text, wie er kam. */
function itemName(items: ItemIndex, raw: string): string {
  const nm = normName(raw);
  if (items.ambiguous.has(nm)) return raw;
  const hit = items.byName.get(nm);
  return hit ? displayName(hit) : raw;
}

function applyBase(c: Character, s: DdbSheet): void {
  c.playerName = s.playerName;
  c.xp = s.xp;
  c.classes = s.classes.map((k) => ({ sourceKey: '', name: k.name, level: Math.min(20, Math.max(1, k.level)) }));
  c.species = { sourceKey: '', name: s.species.name };
  c.backgroundRef = { sourceKey: '', name: s.background.name };
  c.abilities = { ...s.abilities };
  c.mods = Object.fromEntries(Object.entries(s.abilities).map(([k, v]) => [k, mod(v)])) as Character['mods'];
  c.saveProfs = { ...s.saveProfs };
  c.ac = s.ac;
  c.initiative = s.initiative;
  c.speed = metres(s.speedFt);
  c.hpMax = s.hpMax;
  c.hitDice = s.hitDice.replace(/d/gi, 'W');
  c.proficiencyBonus = s.proficiencyBonus;
  c.heroicInspiration = s.heroicInspiration;
  c.passivePerception = s.passivePerception;
  const zero = (v: string) => (v === '0' ? '' : v);
  c.currency = { km: zero(s.currency.cp), sm: zero(s.currency.sp), em: zero(s.currency.ep), gm: zero(s.currency.gp), pm: zero(s.currency.pp) };
}

/** Die Werte stehen fertig im Bogen — inklusive Boni, die der Import nicht kennt. */
function applySkills(c: Character, s: DdbSheet): void {
  const byName = new Map(s.skills.map((sk) => [sk.name, sk]));
  for (const def of SKILL_DEFS) {
    const sk = byName.get(def.en);
    c.skills[def.key] = { value: sk?.value ?? 0, prof: sk?.mark === 'P' || sk?.mark === 'E', exp: sk?.mark === 'E' };
  }
  c.alleskoenner = s.skills.some((sk) => sk.mark === 'H');
}

function applyProficiencies(c: Character, s: DdbSheet, items: ItemIndex): void {
  const p = c.proficiencies;
  for (const a of s.armor.map((x) => x.toLowerCase())) {
    if (a.startsWith('light')) p.lightArmor = true;
    else if (a.startsWith('medium')) p.mediumArmor = true;
    else if (a.startsWith('heavy')) p.heavyArmor = true;
    else if (a.startsWith('shield')) p.shields = true;
  }
  const other: string[] = [];
  for (const w of s.weapons) {
    const lw = w.toLowerCase();
    if (lw.startsWith('simple')) p.simpleWeapons = true;
    else if (lw.startsWith('martial')) p.martialWeapons = true;
    else {
      const hit = matchWeaponName(items, w) ?? matchWeaponName(items, w.replace(/s$/, ''));
      if (hit) p.individualWeapons = [...(p.individualWeapons ?? []), hit];
      else other.push(w);
    }
  }
  if (other.length) p.otherWeapons = other.join(', ');
  c.tools = s.tools.map((t) => itemName(items, t));
  c.languages = [...s.languages];
}

/**
 * D&D Beyond trennt Stapel nach Herkunft (2× Dolch, Pergament 8 + 10) — hier wieder eine Zeile.
 * Eine Entscheidung „verknüpfen" setzt den Link vorab, `linkEntities` lässt die Zeile dann in Ruhe.
 */
function applyInventory(c: Character, s: DdbSheet, log: FindingLog, items: ItemIndex): void {
  const rows = new Map<string, { name: string; qty: number; lbEach: number | null; equipped: boolean }>();
  for (const it of s.inventory) {
    const key = normName(it.name);
    if (log.dropped(findingId('item', it.name))) continue;
    const lbEach = it.totalWeightLb !== null && it.qty > 0 ? it.totalWeightLb / it.qty : it.totalWeightLb;
    const row = rows.get(key);
    if (row) { row.qty += it.qty; row.equipped ||= it.equipped; }
    else rows.set(key, { name: it.name, qty: it.qty, lbEach, equipped: it.equipped });
  }
  c.inventory = [...rows.values()].map((r) => {
    const linked = log.linkedKey(findingId('item', r.name));
    const entry = linked ? items.byKey.get(linked) : undefined;
    return {
      name: entry ? displayName(entry) : r.name,
      ...(entry ? { sourceKey: linked } : {}),
      count: r.qty === 1 ? '' : String(r.qty),
      weight: libraryWeightKg(r.lbEach),
      ...(r.equipped ? { equipped: true } : {}),
    };
  });
}

function applyPersonal(c: Character, s: DdbSheet): void {
  const p = s.personal;
  c.personal.alter = p.age;
  c.personal.sizeCat = MONSTER_SIZES[p.size as MonsterSize] ?? p.size;
  c.personal.gesinnung = p.alignment;
  c.personal.glaube = p.faith;
  c.personal.hautfarbe = p.skin;
  c.personal.augenfarbe = p.eyes;
  c.personal.haarfarbe = p.hair;
  c.personal.gewicht = p.weight;
  c.personal.koerpergroesse = p.height;
  const presentation = presentationOf(p.gender);
  if (presentation) c.presentation = presentation;
  c.traits = s.traits;
  c.ideals = s.ideals;
  c.bonds = s.bonds;
  c.flaws = s.flaws;
}

function detailsText(s: DdbSheet, spellNotes: string[]): string {
  const part = (title: string, text: string) => (text ? `## ${title}\n\n${text}\n` : '');
  return [
    `# ${s.name}\n`,
    part('Hintergrundgeschichte', s.backstory),
    part('Verbündete & Organisationen', s.allies),
    part('Notizen aus D&D Beyond', s.notes),
    part('Zauber ohne Bibliothekseintrag', spellNotes.join('\n\n')),
  ].filter(Boolean).join('\n');
}

export interface BuildOptions {
  resolutions?: Resolutions;
  now?: Date;
}

export async function buildDdbCharacter(s: DdbSheet, libs: DdbImportLibraries, opts: BuildOptions = {}): Promise<DdbImportResult> {
  const c = characterSchema.parse({ name: s.name || 'Importierter Charakter' });
  const log = new FindingLog(opts.resolutions ?? {});

  applyBase(c, s);
  applySkills(c, s);
  applyProficiencies(c, s, libs.items);
  applyInventory(c, s, log, libs.items);
  applyPersonal(c, s);
  const { notes, spellNotes } = await linkEntities(c, s, libs, log);

  c._importedFrom = `dndbeyond-${s.id}`;
  c._importedAt = (opts.now ?? new Date()).toISOString();
  return { character: c, details: detailsText(s, spellNotes), notes, findings: log.findings };
}
